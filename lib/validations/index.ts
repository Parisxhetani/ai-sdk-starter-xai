import { z } from "zod"

import { COFFEE_CHOICES, COFFEE_NOTE_MAX, type CoffeeChoice } from "@/lib/coffee"

const COFFEE_CHOICE_VALUES = COFFEE_CHOICES.map((option) => option.value) as [CoffeeChoice, ...CoffeeChoice[]]

const orderFieldsSchema = z.object({
  user_id: z.string().uuid("Invalid user ID"),
  friday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
  item: z.string().min(1, "Item is required").max(100, "Item name too long"),
  variant: z.string().min(1, "Variant is required").max(100, "Variant name too long"),
  notes: z.string().max(100, "Notes must be 100 characters or less").optional().nullable(),
  cash_available_all: z.number().int("Cash amount must be a whole number").min(0, "Cash amount cannot be negative").default(0),
  coffee_choice: z.enum(COFFEE_CHOICE_VALUES).optional().nullable(),
  coffee_note: z.string().max(COFFEE_NOTE_MAX, `Keep it under ${COFFEE_NOTE_MAX} characters`).optional().nullable(),
})

// Picking "Something else" without saying what is the one coffee mistake worth
// catching in the UI. The inverse (a note with no choice) is left to the DB
// constraint, which sees the whole row and can't be fooled by a partial update.
function requireNoteForOther(
  value: { coffee_choice?: CoffeeChoice | null; coffee_note?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.coffee_choice === "other" && !value.coffee_note?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coffee_note"],
      message: "Tell us what you'd like",
    })
  }
}

export const createOrderSchema = orderFieldsSchema.superRefine(requireNoteForOther)

export const updateOrderSchema = orderFieldsSchema
  .partial()
  .extend({ id: z.string().uuid("Invalid order ID") })
  .superRefine(requireNoteForOther)

export const deleteOrderSchema = z.object({
  id: z.string().uuid("Invalid order ID"),
})

export const menuitemSchema = z.object({
  item: z.string().min(1, "Item name is required").max(100, "Item name too long"),
  variant: z.string().min(1, "Variant is required").max(100, "Variant name too long"),
  active: z.boolean().default(true),
})

export const updateUserSchema = z.object({
  id: z.string().uuid("Invalid user ID"),
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name too long").optional(),
  phone: z.string().max(20, "Phone number too long").optional().nullable(),
  role: z.enum(["admin", "member"]).optional(),
  whitelisted: z.boolean().optional(),
})

export const createMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(1000, "Message too long (max 1000 characters)"),
})

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
})

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
})

export const settingsSchema = z.object({
  key: z.string().max(50, "Settings key too long"),
  value: z.string().max(500, "Settings value too long"),
})

export const bulkActionSchema = z.object({
  action: z.enum(["lock", "unlock", "delete"]),
  orderIds: z.array(z.string().uuid()).min(1, "At least one order ID required"),
})

// API Response types
export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>
export type MenuItemInput = z.infer<typeof menuitemSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type CreateMessageInput = z.infer<typeof createMessageSchema>
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>
export type SettingsInput = z.infer<typeof settingsSchema>
export type BulkActionInput = z.infer<typeof bulkActionSchema>
