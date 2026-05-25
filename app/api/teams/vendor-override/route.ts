import { type NextRequest, NextResponse } from "next/server"
import { requireTeamAdmin, isErrorResponse } from "@/lib/supabase/auth-helpers"

// GET: list overrides for a team. ?teamId=
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const teamId = url.searchParams.get("teamId")
  if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 })

  const gate = await requireTeamAdmin(teamId)
  if (isErrorResponse(gate)) return gate.errorResponse

  const { data, error } = await gate.admin
    .from("team_vendor_overrides")
    .select("team_id, friday_date, vendor_id, created_at")
    .eq("team_id", teamId)
    .order("friday_date", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ overrides: data ?? [] })
}

// PUT: upsert an override for a (team, friday_date). Body: { teamId, fridayDate, vendorId }
export async function PUT(request: NextRequest) {
  const { teamId, fridayDate, vendorId } = await request.json()
  if (!teamId || !fridayDate || !vendorId) {
    return NextResponse.json({ error: "teamId, fridayDate, vendorId required" }, { status: 400 })
  }

  const gate = await requireTeamAdmin(teamId)
  if (isErrorResponse(gate)) return gate.errorResponse

  const { error } = await gate.admin
    .from("team_vendor_overrides")
    .upsert(
      { team_id: teamId, friday_date: fridayDate, vendor_id: vendorId },
      { onConflict: "team_id,friday_date" },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "team_vendor_override_set",
    user_id: gate.actorId,
    payload: { team_id: teamId, friday_date: fridayDate, vendor_id: vendorId },
  })

  return NextResponse.json({ success: true })
}

// DELETE: clear the override for a (team, friday_date). ?teamId=&fridayDate=
export async function DELETE(request: NextRequest) {
  const url = new URL(request.url)
  const teamId = url.searchParams.get("teamId")
  const fridayDate = url.searchParams.get("fridayDate")
  if (!teamId || !fridayDate) {
    return NextResponse.json({ error: "teamId and fridayDate required" }, { status: 400 })
  }

  const gate = await requireTeamAdmin(teamId)
  if (isErrorResponse(gate)) return gate.errorResponse

  const { error } = await gate.admin
    .from("team_vendor_overrides")
    .delete()
    .eq("team_id", teamId)
    .eq("friday_date", fridayDate)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await gate.admin.from("events").insert({
    type: "team_vendor_override_cleared",
    user_id: gate.actorId,
    payload: { team_id: teamId, friday_date: fridayDate },
  })

  return NextResponse.json({ success: true })
}
