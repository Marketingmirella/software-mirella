import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { nombreNegocio, nombreDueno, email, password } = await req.json()
    if (!nombreNegocio || !nombreDueno || !email || !password)
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Crear negocio
    const { data: negocio, error: errN } = await admin
      .from('negocios').insert({ nombre: nombreNegocio }).select('id').single()
    if (errN || !negocio)
      return NextResponse.json({ error: errN?.message || 'Error al crear negocio' }, { status: 400 })

    // 2. Crear usuario en Auth
    const { data: authData, error: errA } = await admin.auth.admin.createUser({
      email, password, email_confirm: true
    })
    if (errA || !authData.user) {
      await admin.from('negocios').delete().eq('id', negocio.id)
      return NextResponse.json({ error: errA?.message || 'Error al crear usuario' }, { status: 400 })
    }

    // 3. Crear perfil
    const { error: errU } = await admin.from('usuarios').insert({
      id: authData.user.id, negocio_id: negocio.id, nombre: nombreDueno, rol: 'gerente'
    })
    if (errU) {
      await admin.auth.admin.deleteUser(authData.user.id)
      await admin.from('negocios').delete().eq('id', negocio.id)
      return NextResponse.json({ error: errU.message }, { status: 400 })
    }

    // 4. Categorías por defecto
    await admin.from('categorias').insert([
      { negocio_id: negocio.id, nombre: 'Entradas', orden: 1 },
      { negocio_id: negocio.id, nombre: 'Platos fuertes', orden: 2 },
      { negocio_id: negocio.id, nombre: 'Bebidas', orden: 3 },
      { negocio_id: negocio.id, nombre: 'Postres', orden: 4 },
    ])

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
