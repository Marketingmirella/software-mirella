'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageCircle, X, Send } from 'lucide-react'

interface Mensaje {
  id: number
  usuario_id: string | null
  usuario_nombre: string
  rol: string
  mensaje: string
  created_at: string
}

// Colores y emojis por rol
const ROL: Record<string, { boton: string; burbuja: string; emoji: string; etiqueta: string }> = {
  gerente: { boton: 'bg-purple-600', burbuja: 'bg-purple-600', emoji: '👔', etiqueta: 'Gerencia' },
  mesera:  { boton: 'bg-orange-500', burbuja: 'bg-orange-500', emoji: '👩',  etiqueta: 'Mesera'   },
  cocina:  { boton: 'bg-amber-600',  burbuja: 'bg-amber-600',  emoji: '👨‍🍳', etiqueta: 'Cocina'   },
}

function formatHora(ts: string) {
  return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatFlotante() {
  const [abierto, setAbierto]       = useState(false)
  const [mensajes, setMensajes]     = useState<Mensaje[]>([])
  const [texto, setTexto]           = useState('')
  const [miId, setMiId]             = useState<string | null>(null)
  const [miPerfil, setMiPerfil]     = useState<{ nombre: string; rol: string } | null>(null)
  const [noLeidos, setNoLeidos]     = useState(0)

  const abiertoRef = useRef(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  // Mantener ref sincronizado con el estado para usarlo dentro de callbacks
  useEffect(() => {
    abiertoRef.current = abierto
    if (abierto) {
      setNoLeidos(0)
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        inputRef.current?.focus()
      }, 80)
    }
  }, [abierto])

  useEffect(() => {
    const init = async () => {
      // Cargar datos del usuario actual
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMiId(user.id)

      const { data: perfil } = await supabase
        .from('usuarios').select('nombre, rol').eq('id', user.id).single()
      if (perfil) setMiPerfil(perfil as { nombre: string; rol: string })

      // Cargar últimos 80 mensajes
      const { data: msgs } = await supabase
        .from('mensajes_internos')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(80)
      if (msgs) setMensajes(msgs as Mensaje[])
    }
    init()

    // Escuchar mensajes nuevos en tiempo real
    const canal = supabase.channel('chat-interno-staff')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes_internos',
      }, (payload) => {
        const nuevo = payload.new as Mensaje
        setMensajes(prev => [...prev, nuevo])
        if (!abiertoRef.current) {
          // Chat cerrado → mostrar globito con número
          setNoLeidos(prev => prev + 1)
        } else {
          // Chat abierto → bajar al nuevo mensaje
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [supabase])

  async function enviar() {
    const msg = texto.trim()
    if (!msg || !miPerfil) return
    setTexto('')
    await supabase.from('mensajes_internos').insert({
      usuario_id:     miId,
      usuario_nombre: miPerfil.nombre,
      rol:            miPerfil.rol,
      mensaje:        msg,
    })
  }

  const miRol = miPerfil ? (ROL[miPerfil.rol] ?? ROL.mesera) : ROL.mesera

  return (
    <>
      {/* ── Panel de chat ─────────────────────────────────────── */}
      {abierto && (
        <div className="fixed bottom-20 right-4 w-80 sm:w-96 h-[430px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-[9999] overflow-hidden" style={{ animation: 'fadeIn .15s ease' }}>

          {/* Cabecera */}
          <div className={`${miRol.boton} text-white px-4 py-3 flex items-center justify-between shrink-0`}>
            <div className="flex items-center gap-2">
              <MessageCircle size={18} />
              <div>
                <p className="font-bold text-sm leading-tight">Chat del equipo</p>
                <p className="text-xs opacity-75">Gerencia · Meseras · Cocina</p>
              </div>
            </div>
            <button onClick={() => setAbierto(false)}
              className="hover:bg-white/20 p-1 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Lista de mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {mensajes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center">
                <MessageCircle size={36} className="mb-2 opacity-30" />
                <p className="text-sm font-medium">Sin mensajes aún</p>
                <p className="text-xs mt-1">¡Escribe el primero!</p>
              </div>
            )}

            {mensajes.map(m => {
              const esMio  = m.usuario_id === miId
              const rCfg   = ROL[m.rol] ?? { boton: 'bg-gray-400', burbuja: 'bg-gray-400', emoji: '👤', etiqueta: m.rol }
              return (
                <div key={m.id} className={`flex gap-2 ${esMio ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar con emoji del rol */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${rCfg.boton} text-white`}>
                    {rCfg.emoji}
                  </div>

                  {/* Burbuja */}
                  <div className={`max-w-[72%] flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
                    {!esMio && (
                      <p className="text-xs text-gray-500 font-semibold mb-0.5 px-1">
                        {m.usuario_nombre}
                        <span className="font-normal text-gray-400"> · {rCfg.etiqueta}</span>
                      </p>
                    )}
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                      esMio
                        ? `${rCfg.burbuja} text-white rounded-tr-sm`
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                    }`}>
                      {m.mensaje}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 px-1">{formatHora(m.created_at)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input de mensaje */}
          <div className="p-3 border-t border-gray-200 bg-white shrink-0 flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              placeholder="Escribe un mensaje... (Enter para enviar)"
              maxLength={300}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <button
              onClick={enviar}
              disabled={!texto.trim() || !miPerfil}
              className={`${miRol.boton} hover:opacity-90 disabled:bg-gray-200 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-all active:scale-95 shrink-0`}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Botón flotante ────────────────────────────────────── */}
      <button
        onClick={() => setAbierto(prev => !prev)}
        className={`fixed bottom-4 right-4 w-14 h-14 ${miRol.boton} hover:opacity-90 text-white rounded-full shadow-lg shadow-black/25 flex items-center justify-center z-[9998] transition-all active:scale-95`}>
        {abierto ? <X size={24} /> : <MessageCircle size={24} />}

        {/* Badge de mensajes sin leer */}
        {!abierto && noLeidos > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-bounce">
            {noLeidos > 9 ? '9+' : noLeidos}
          </span>
        )}
      </button>
    </>
  )
}
