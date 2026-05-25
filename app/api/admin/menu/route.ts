import { type NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin, isErrorResponse } from "@/lib/supabase/auth-helpers"

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const { item, variant, vendor_id, price_all } = await request.json()
  if (!item?.trim() || !variant?.trim()) {
    return NextResponse.json({ error: "item and variant are required" }, { status: 400 })
  }

  let resolvedVendorId = vendor_id as string | undefined
  if (!resolvedVendorId) {
    const { data: tony } = await gate.admin.from("vendors").select("id").eq("slug", "TONY").maybeSingle()
    resolvedVendorId = tony?.id
  }
  if (!resolvedVendorId) {
    return NextResponse.json({ error: "vendor_id required (no default vendor found)" }, { status: 400 })
  }

  const insertRow: Record<string, unknown> = {
    item: item.trim(),
    variant: variant.trim(),
    active: true,
    vendor_id: resolvedVendorId,
  }
  if (typeof price_all === "number" && Number.isFinite(price_all) && price_all >= 0) {
    insertRow.price_all = price_all
  }

  const { data, error } = await gate.admin
    .from("menu_items")
    .insert(insertRow)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "menu_item_created",
    user_id: gate.actorId,
    payload: { menu_item_id: data.id, item: item.trim(), variant: variant.trim() },
  })

  return NextResponse.json({ menuItem: data })
}

export async function DELETE(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const { data: menuItem } = await gate.admin
    .from("menu_items")
    .select("item, variant")
    .eq("id", id)
    .maybeSingle()

  const { error } = await gate.admin.from("menu_items").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "menu_item_deleted",
    user_id: gate.actorId,
    payload: { menu_item_id: id, item: menuItem?.item, variant: menuItem?.variant },
  })

  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if (isErrorResponse(gate)) return gate.errorResponse

  const { id, active } = await request.json()
  if (!id || typeof active !== "boolean") {
    return NextResponse.json({ error: "id and active are required" }, { status: 400 })
  }

  const { error } = await gate.admin.from("menu_items").update({ active }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: active ? "menu_item_enabled" : "menu_item_disabled",
    user_id: gate.actorId,
    payload: { menu_item_id: id, active },
  })

  return NextResponse.json({ success: true })
}
