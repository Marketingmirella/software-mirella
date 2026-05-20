import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario) {
    redirect('/login')
  }

  const rutas: Record<string, string> = {
    gerente: '/gerencia',
    mesera: '/mesera',
    cocina: '/cocina',
  }

  redirect(rutas[usuario.rol] || '/login')
}
