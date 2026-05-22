import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { nombreNegocio, nombreDueno, email, password } = await request.json()
    if (!nombreNegocio || !nombreDueno || !email || !password)
      return NextResponse.json({ error: 'Completa todos los campos' }, { status: 400 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Crear negocio
    const { data: negocio, error: errN } = await admin
      .from('negocios')
      .insert({ nombre: nombreNegocio, onboarding_completo: false })
      .select('id').single()
    if (errN || !negocio) return NextResponse.json({ error: errN?.message || 'Error creando negocio' }, { status: 400 })

    // 2. Crear usuario auth
    const { data: authData, error: errA } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errA || !authData.user) {
      await admin.from('negocios').delete().eq('id', negocio.id)
      return NextResponse.json({ error: errA?.message || 'Error creando cuenta' }, { status: 400 })
    }

    // 3. Crear perfil usuario vinculado al negocio
    const { error: errU } = await admin.from('usuarios').insert({
      id: authData.user.id, nombre: nombreDueno, rol: 'gerente', negocio_id: negocio.id,
    })
    if (errU) {
      await admin.auth.admin.deleteUser(authData.user.id)
      await admin.from('negocios').delete().eq('id', negocio.id)
      return NextResponse.json({ error: errU.message }, { status: 400 })
    }

    // 4. Categorías por defecto
    const categoriasDef = ['Entradas', 'Platos principales', 'Postres', 'Bebidas']
    await admin.from('categorias').insert(
      categoriasDef.map((nombre, i) => ({ nombre, orden: i + 1, negocio_id: negocio.id }))
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
