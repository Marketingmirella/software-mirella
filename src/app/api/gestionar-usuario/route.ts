import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// PATCH — cambiar contraseña y/o estado activo
export async function PATCH(request: Request) {
  try {
    const { id, nuevaPassword, activo } = await request.json()
    if (!id) return NextResponse.json({ error: 'Falta el ID del usuario' }, { status: 400 })

    const admin = getAdmin()

    if (nuevaPassword) {
      const { error } = await admin.auth.admin.updateUserById(id, { password: nuevaPassword })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (activo !== undefined) {
      // ban_duration 'none' = activo | '876600h' ≈ 100 años = inhabilitado
      const { error } = await admin.auth.admin.updateUserById(id, {
        ban_duration: activo ? 'none' : '876600h',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await admin.from('usuarios').update({ activo }).eq('id', id)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Error interno: ${message}` }, { status: 500 })
  }
}

// DELETE — eliminar usuario definitivamente
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Falta el ID del usuario' }, { status: 400 })

    const admin = getAdmin()

    // Primero borrar de la tabla usuarios (FK)
    await admin.from('usuarios').delete().eq('id', id)

    // Luego eliminar de Auth
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Error interno: ${message}` }, { status: 500 })
  }
}
