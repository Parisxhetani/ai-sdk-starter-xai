import type { MenuItem, Order } from "@/lib/types"
import { getMenuItemLookupKey } from "@/lib/utils"

export interface CashPlanParticipant {
  orderId: string
  userId: string
  name: string
  item: string
  variant: string
  priceAll: number
  cashAvailableAll: number
}

export interface CashPlanContribution {
  orderId: string
  userId: string
  name: string
  mealCostAll: number
  cashAvailableAll: number
  paysTonyAll: number
  receivesChangeAll: number
  netContributionAll: number
  balanceAll: number
}

export interface CashPlanSettlement {
  fromOrderId: string
  fromUserId: string
  fromName: string
  toOrderId: string
  toUserId: string
  toName: string
  amountAll: number
}

export interface CashPlan {
  participants: CashPlanParticipant[]
  unpricedParticipants: Omit<CashPlanParticipant, "priceAll">[]
  totalCostAll: number
  totalCashAvailableAll: number
  cashEnteredCount: number
  missingCashCount: number
  canCoverTotal: boolean
  isComplete: boolean
  shortfallAll: number
  tonyChangeAll: number
  selectedContributorsCount: number
  contributions: CashPlanContribution[]
  settlements: CashPlanSettlement[]
}

type EvaluatedSelection = {
  changeAll: number
  selectedContributorsCount: number
  contributions: CashPlanContribution[]
  settlements: CashPlanSettlement[]
}

function normalizeCashAmount(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return 0
  }

  return Math.floor(value)
}

function buildSettlements(
  participants: CashPlanParticipant[],
  balances: number[],
): CashPlanSettlement[] {
  const creditors = participants
    .map((participant, index) => ({ participant, index, balanceAll: balances[index] }))
    .filter((entry) => entry.balanceAll > 0)
    .sort((left, right) => right.balanceAll - left.balanceAll || left.participant.name.localeCompare(right.participant.name))

  const debtors = participants
    .map((participant, index) => ({ participant, index, balanceAll: balances[index] }))
    .filter((entry) => entry.balanceAll < 0)
    .sort((left, right) => left.balanceAll - right.balanceAll || left.participant.name.localeCompare(right.participant.name))

  const settlements: CashPlanSettlement[] = []
  let creditorIndex = 0
  let debtorIndex = 0

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]
    const debtor = debtors[debtorIndex]
    const amountAll = Math.min(creditor.balanceAll, Math.abs(debtor.balanceAll))

    if (amountAll > 0) {
      settlements.push({
        fromOrderId: debtor.participant.orderId,
        fromUserId: debtor.participant.userId,
        fromName: debtor.participant.name,
        toOrderId: creditor.participant.orderId,
        toUserId: creditor.participant.userId,
        toName: creditor.participant.name,
        amountAll,
      })
    }

    creditor.balanceAll -= amountAll
    debtor.balanceAll += amountAll

    if (creditor.balanceAll === 0) {
      creditorIndex += 1
    }

    if (debtor.balanceAll === 0) {
      debtorIndex += 1
    }
  }

  return settlements
}

function evaluateSelection(
  participants: CashPlanParticipant[],
  selectedIndexes: Set<number>,
  totalCostAll: number,
): EvaluatedSelection | null {
  const contributions = participants.map((participant, index) => {
    const isSelected = selectedIndexes.has(index)
    const paysTonyAll = isSelected ? participant.cashAvailableAll : 0

    return {
      orderId: participant.orderId,
      userId: participant.userId,
      name: participant.name,
      mealCostAll: participant.priceAll,
      cashAvailableAll: participant.cashAvailableAll,
      paysTonyAll,
      receivesChangeAll: 0,
      netContributionAll: paysTonyAll,
      balanceAll: isSelected ? paysTonyAll - participant.priceAll : -participant.priceAll,
    } satisfies CashPlanContribution
  })

  const changeAll =
    contributions.reduce((sum, contribution) => sum + contribution.paysTonyAll, 0) - totalCostAll

  let remainingChangeAll = changeAll
  const refundableIndexes = contributions
    .map((contribution, index) => ({ contribution, index }))
    .filter((entry) => selectedIndexes.has(entry.index) && entry.contribution.balanceAll > 0)
    .sort(
      (left, right) =>
        right.contribution.balanceAll - left.contribution.balanceAll || left.contribution.name.localeCompare(right.contribution.name),
    )

  for (const { contribution, index } of refundableIndexes) {
    if (remainingChangeAll <= 0) break

    const refundAll = Math.min(contribution.balanceAll, remainingChangeAll)
    contributions[index].receivesChangeAll = refundAll
    contributions[index].netContributionAll -= refundAll
    contributions[index].balanceAll -= refundAll
    remainingChangeAll -= refundAll
  }

  if (remainingChangeAll !== 0) {
    return null
  }

  const settlements = buildSettlements(
    participants,
    contributions.map((contribution) => contribution.balanceAll),
  )

  return {
    changeAll,
    selectedContributorsCount: contributions.filter((contribution) => contribution.paysTonyAll > 0).length,
    contributions,
    settlements,
  }
}

function compareSelections(left: EvaluatedSelection, right: EvaluatedSelection) {
  if (left.changeAll !== right.changeAll) {
    return left.changeAll - right.changeAll
  }

  if (left.settlements.length !== right.settlements.length) {
    return left.settlements.length - right.settlements.length
  }

  return left.selectedContributorsCount - right.selectedContributorsCount
}

export function buildCashPlan(orders: Order[], menuItems: MenuItem[]): CashPlan | null {
  if (!orders.length) {
    return null
  }

  const priceMap = new Map(menuItems.map((item) => [getMenuItemLookupKey(item.item, item.variant), item.price_all]))
  const participants: CashPlanParticipant[] = []
  const unpricedParticipants: CashPlan["unpricedParticipants"] = []

  orders.forEach((order) => {
    const priceAll = priceMap.get(getMenuItemLookupKey(order.item, order.variant))
    const participantBase = {
      orderId: order.id,
      userId: order.user_id,
      name: order.user?.name || order.user?.email || order.user_id,
      item: order.item,
      variant: order.variant,
      cashAvailableAll: normalizeCashAmount(order.cash_available_all),
    }

    if (typeof priceAll !== "number" || Number.isNaN(priceAll) || priceAll <= 0) {
      unpricedParticipants.push(participantBase)
      return
    }

    participants.push({
      ...participantBase,
      priceAll,
    })
  })

  const totalCostAll = participants.reduce((sum, participant) => sum + participant.priceAll, 0)
  const totalCashAvailableAll = participants.reduce((sum, participant) => sum + participant.cashAvailableAll, 0)
  const cashEnteredCount = participants.filter((participant) => participant.cashAvailableAll > 0).length
  const missingCashCount = participants.length - cashEnteredCount

  if (!participants.length) {
    return {
      participants,
      unpricedParticipants,
      totalCostAll: 0,
      totalCashAvailableAll: 0,
      cashEnteredCount: 0,
      missingCashCount: 0,
      canCoverTotal: false,
      isComplete: unpricedParticipants.length === 0,
      shortfallAll: 0,
      tonyChangeAll: 0,
      selectedContributorsCount: 0,
      contributions: [],
      settlements: [],
    }
  }

  if (unpricedParticipants.length > 0) {
    return {
      participants,
      unpricedParticipants,
      totalCostAll,
      totalCashAvailableAll,
      cashEnteredCount,
      missingCashCount,
      canCoverTotal: false,
      isComplete: false,
      shortfallAll: 0,
      tonyChangeAll: 0,
      selectedContributorsCount: 0,
      contributions: [],
      settlements: [],
    }
  }

  const candidates = participants
    .map((participant, index) => ({ participant, index }))
    .filter((entry) => entry.participant.cashAvailableAll > 0)

  if (totalCashAvailableAll < totalCostAll || candidates.length === 0) {
    return {
      participants,
      unpricedParticipants,
      totalCostAll,
      totalCashAvailableAll,
      cashEnteredCount,
      missingCashCount,
      canCoverTotal: false,
      isComplete: true,
      shortfallAll: Math.max(totalCostAll - totalCashAvailableAll, 0),
      tonyChangeAll: 0,
      selectedContributorsCount: candidates.length,
      contributions: participants.map((participant) => ({
        orderId: participant.orderId,
        userId: participant.userId,
        name: participant.name,
        mealCostAll: participant.priceAll,
        cashAvailableAll: participant.cashAvailableAll,
        paysTonyAll: participant.cashAvailableAll,
        receivesChangeAll: 0,
        netContributionAll: participant.cashAvailableAll,
        balanceAll: participant.cashAvailableAll - participant.priceAll,
      })),
      settlements: [],
    }
  }

  let bestSelection: EvaluatedSelection | null = null
  const totalMasks = 1 << candidates.length

  for (let mask = 1; mask < totalMasks; mask += 1) {
    let selectedCashAll = 0
    const selectedIndexes = new Set<number>()

    candidates.forEach(({ participant, index }, candidateIndex) => {
      if ((mask & (1 << candidateIndex)) === 0) {
        return
      }

      selectedIndexes.add(index)
      selectedCashAll += participant.cashAvailableAll
    })

    if (selectedCashAll < totalCostAll) {
      continue
    }

    const evaluatedSelection = evaluateSelection(participants, selectedIndexes, totalCostAll)
    if (!evaluatedSelection) {
      continue
    }

    if (!bestSelection || compareSelections(evaluatedSelection, bestSelection) < 0) {
      bestSelection = evaluatedSelection
    }
  }

  if (!bestSelection) {
    return {
      participants,
      unpricedParticipants,
      totalCostAll,
      totalCashAvailableAll,
      cashEnteredCount,
      missingCashCount,
      canCoverTotal: false,
      isComplete: true,
      shortfallAll: 0,
      tonyChangeAll: 0,
      selectedContributorsCount: 0,
      contributions: [],
      settlements: [],
    }
  }

  return {
    participants,
    unpricedParticipants,
    totalCostAll,
    totalCashAvailableAll,
    cashEnteredCount,
    missingCashCount,
    canCoverTotal: true,
    isComplete: true,
    shortfallAll: 0,
    tonyChangeAll: bestSelection.changeAll,
    selectedContributorsCount: bestSelection.selectedContributorsCount,
    contributions: bestSelection.contributions,
    settlements: bestSelection.settlements,
  }
}
