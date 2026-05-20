import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { email, password, nombre, rol } = await request.json()

  if (!email || !password || !nombre || !rol) {
    return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Crea el usuario en Auth y lo confirma automáticamente (sin email)
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error || !data.user) {
    return NextResponse.json({ error: error?.message || 'Error al crear usuario' }, { status: 400 })
  }

  // Insertar perfil en tabla usuarios
  const { error: dbError } = await supabaseAdmin
    .from('usuarios')
    .insert({ id: data.user.id, nombre, rol })

  if (dbError) {
    // Si falla la BD, eliminar el usuario de auth para no dejar datos huérfanos
    await supabaseAdmin.auth.admin.deleteUser(data.user.id)
    return NextResponse.json({ error: dbError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, nombre })
}
