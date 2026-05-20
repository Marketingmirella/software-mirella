'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageCircle, X, Send, ArrowLeft, Plus, ChevronRight, LogOut } from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Mensaje {
  id: number
  usuario_id: string | null
  usuario_nombre: string
  rol: string
  mensaje: string
  created_at: string
  grupo_id: string | null
}

interface GrupoChat {
  id: string          // 'general' o UUID
  nombre: string
  tipo: 'general' | 'directo' | 'grupo'
  noLeidos: number
}

interface UsuarioItem {
  id: string
  nombre: string
  rol: string
}

type Vista = 'cerrado' | 'lista' | 'mensajes' | 'nuevo'

// ─── Helpers de rol ──────────────────────────────────────────────────────────
const ROL: Record<string, { color: string; emoji: string; etiqueta: string }> = {
  gerente: { color: 'bg-purple-600', emoji: '👔', etiqueta: 'Gerencia' },
  mesera:  { color: 'bg-orange-500', emoji: '👩',  etiqueta: 'Mesera'   },
  cocina:  { color: 'bg-amber-600',  emoji: '👨‍🍳', etiqueta: 'Cocina'   },
}
const ROL_DEFAULT = { color: 'bg-gray-500', emoji: '👤', etiqueta: 'Equipo' }
const rol = (r: string) => ROL[r] ?? ROL_DEFAULT

function hora(ts: string) {
  return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function ChatFlotante() {
  const [vista, setVista]               = useState<Vista>('cerrado')
  const [miId, setMiId]                 = useState<string | null>(null)
  const [miPerfil, setMiPerfil]         = useState<{ nombre: string; rol: string } | null>(null)
  const [grupos, setGrupos]             = useState<GrupoChat[]>([])
  const [grupoActivo, setGrupoActivo]   = useState<GrupoChat | null>(null)
  const [mensajes, setMensajes]         = useState<Mensaje[]>([])
  const [texto, setTexto]               = useState('')

  // Crear nuevo chat
  const [usuarios, setUsuarios]         = useState<UsuarioItem[]>([])
  const [seleccion, setSeleccion]       = useState<string[]>([])
  const [nombreGrupo, setNombreGrupo]   = useState('')
  const [creando, setCreando]           = useState(false)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const grupoRef      = useRef<GrupoChat | null>(null)
  const miIdRef       = useRef<string | null>(null)

  const supabase = createClient()

  // Mantener refs sincronizados (para usarlos dentro de callbacks de realtime)
  useEffect(() => { grupoRef.current = grupoActivo }, [grupoActivo])
  useEffect(() => { miIdRef.current  = miId         }, [miId])

  // ── Cerrar sesión ─────────────────────────────────────────────────────────
  async function cerrarSesion() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // ── Cargar lista de grupos ──────────────────────────────────────────────────
  const cargarGrupos = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('chat_miembros')
      .select('grupo_id, grupo:chat_grupos(id, nombre, tipo)')
      .eq('usuario_id', userId)

    setGrupos(prev => {
      // Preservar conteo de no-leídos al recargar
      const noLeidosMap: Record<string, number> = {}
      prev.forEach(g => { noLeidosMap[g.id] = g.noLeidos })

      const gruposDB: GrupoChat[] = (data || []).map(m => {
        const g = m.grupo as unknown as { id: string; nombre: string; tipo: string }
        return { id: g.id, nombre: g.nombre, tipo: g.tipo as GrupoChat['tipo'], noLeidos: noLeidosMap[g.id] ?? 0 }
      })

      return [
        { id: 'general', nombre: 'General', tipo: 'general', noLeidos: noLeidosMap['general'] ?? 0 },
        ...gruposDB,
      ]
    })
  }, [supabase])

  // ── Inicializar y suscribirse a realtime ───────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMiId(user.id)
      miIdRef.current = user.id

      const { data: perfil } = await supabase
        .from('usuarios').select('nombre, rol').eq('id', user.id).single()
      if (perfil) setMiPerfil(perfil as { nombre: string; rol: string })

      await cargarGrupos(user.id)
    }
    init()

    const canal = supabase.channel('chat-flotante')
      // Mensaje nuevo
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_internos' }, (payload) => {
        const msg        = payload.new as Mensaje
        const msgGrupo   = msg.grupo_id ?? 'general'
        const grupoAbierto = grupoRef.current?.id

        if (grupoAbierto === msgGrupo) {
          // Chat abierto → agregar al hilo visible
          setMensajes(prev => [...prev, msg])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
        } else {
          // Chat cerrado o diferente → sumar no-leído
          setGrupos(prev => prev.map(g =>
            g.id === msgGrupo ? { ...g, noLeidos: g.noLeidos + 1 } : g
          ))
        }
      })
      // Me agregaron a un grupo nuevo
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_miembros' }, (payload) => {
        const row = payload.new as { usuario_id: string }
        if (miIdRef.current && row.usuario_id === miIdRef.current) {
          cargarGrupos(miIdRef.current)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [supabase, cargarGrupos])

  // ── Abrir un chat y cargar sus mensajes ────────────────────────────────────
  async function abrirGrupo(grupo: GrupoChat) {
    setGrupoActivo(grupo)
    grupoRef.current = grupo
    setMensajes([])
    setVista('mensajes')

    const { data } = grupo.id === 'general'
      ? await supabase.from('mensajes_internos').select('*').is('grupo_id', null)
          .order('created_at', { ascending: true }).limit(80)
      : await supabase.from('mensajes_internos').select('*').eq('grupo_id', grupo.id)
          .order('created_at', { ascending: true }).limit(80)

    if (data) setMensajes(data as Mensaje[])

    // Marcar como leído
    setGrupos(prev => prev.map(g => g.id === grupo.id ? { ...g, noLeidos: 0 } : g))

    setTimeout(() => {
      bottomRef.current?.scrollIntoView()
      inputRef.current?.focus()
    }, 100)
  }

  // ── Enviar mensaje ─────────────────────────────────────────────────────────
  async function enviar() {
    const msg = texto.trim()
    if (!msg || !miPerfil || !grupoActivo) return
    setTexto('')
    await supabase.from('mensajes_internos').insert({
      usuario_id:     miId,
      usuario_nombre: miPerfil.nombre,
      rol:            miPerfil.rol,
      mensaje:        msg,
      grupo_id:       grupoActivo.id === 'general' ? null : grupoActivo.id,
    })
  }

  // ── Abrir vista de "nuevo chat" cargando usuarios activos ──────────────────
  async function abrirNuevo() {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nombre, rol')
      .eq('activo', true)
      .neq('id', miId ?? '')
      .order('nombre')
    if (data) setUsuarios(data as UsuarioItem[])
    setSeleccion([])
    setNombreGrupo('')
    setVista('nuevo')
  }

  // ── Crear DM o grupo ───────────────────────────────────────────────────────
  async function crearChat() {
    if (!seleccion.length || !miId) return
    setCreando(true)

    const esDM = seleccion.length === 1

    if (esDM) {
      // Verificar si ya existe un DM con esa persona
      const { data: memb } = await supabase
        .from('chat_miembros')
        .select('grupo_id, grupo:chat_grupos(tipo)')
        .eq('usuario_id', miId)

      const idsDirectos = (memb || [])
        .filter(m => (m.grupo as unknown as { tipo: string } | null)?.tipo === 'directo')
        .map(m => m.grupo_id)

      if (idsDirectos.length) {
        const { data: existente } = await supabase
          .from('chat_miembros')
          .select('grupo_id')
          .in('grupo_id', idsDirectos)
          .eq('usuario_id', seleccion[0])
          .maybeSingle()

        if (existente) {
          setCreando(false)
          const gExist = grupos.find(g => g.id === existente.grupo_id)
          if (gExist) { await abrirGrupo(gExist); return }
          await cargarGrupos(miId)
          setVista('lista')
          return
        }
      }
    }

    // Nombre: para DM usamos el nombre de la otra persona; para grupo lo que escribió el usuario
    const targetUser = esDM ? usuarios.find(u => u.id === seleccion[0]) : null
    const nombre     = esDM ? (targetUser?.nombre ?? 'Chat directo') : (nombreGrupo.trim() || 'Grupo nuevo')

    const { data: nuevoG } = await supabase
      .from('chat_grupos')
      .insert({ nombre, tipo: esDM ? 'directo' : 'grupo', creado_por: miId })
      .select().single()

    if (!nuevoG) { setCreando(false); return }

    await supabase.from('chat_miembros').insert(
      [miId, ...seleccion].map(uid => ({ grupo_id: nuevoG.id, usuario_id: uid }))
    )

    const nuevoChat: GrupoChat = {
      id: nuevoG.id, nombre, tipo: esDM ? 'directo' : 'grupo', noLeidos: 0,
    }
    setGrupos(prev => [...prev, nuevoChat])
    setCreando(false)
    await abrirGrupo(nuevoChat)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const totalNoLeidos = grupos.reduce((a, g) => a + g.noLeidos, 0)
  const miRol = miPerfil ? rol(miPerfil.rol) : ROL_DEFAULT

  // Solo botón flotante cuando está cerrado
  if (vista === 'cerrado') {
    return (
      <button onClick={() => setVista('lista')}
        className={`fixed bottom-4 right-4 w-14 h-14 ${miRol.color} hover:opacity-90 text-white rounded-full shadow-lg shadow-black/25 flex items-center justify-center z-[9998] active:scale-95 transition-all`}>
        <MessageCircle size={24} />
        {totalNoLeidos > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-bounce">
            {totalNoLeidos > 9 ? '9+' : totalNoLeidos}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 sm:w-96 h-[490px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-[9999] overflow-hidden">

      {/* ══ LISTA DE CHATS ═══════════════════════════════════════════ */}
      {vista === 'lista' && (
        <>
          <div className={`${miRol.color} text-white px-4 py-3 flex items-center justify-between shrink-0`}>
            <div className="flex items-center gap-2">
              <MessageCircle size={18} />
              <p className="font-bold text-sm">Chat del equipo</p>
            </div>
            <button onClick={() => setVista('cerrado')} className="hover:bg-white/20 p-1.5 rounded-lg transition-colors">
              <X size={17} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {grupos.map(g => (
              <button key={g.id} onClick={() => abrirGrupo(g)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                {/* Icono */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0 text-white ${
                  g.tipo === 'general' ? 'bg-gray-600' :
                  g.tipo === 'directo' ? 'bg-blue-500' : 'bg-teal-500'
                }`}>
                  {g.tipo === 'general' ? '📢' : g.tipo === 'directo' ? '👤' : '👥'}
                </div>
                {/* Texto */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{g.nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {g.tipo === 'general' ? 'Todo el personal' :
                     g.tipo === 'directo' ? 'Mensaje directo' : 'Grupo'}
                  </p>
                </div>
                {/* Badge + flecha */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {g.noLeidos > 0 && (
                    <span className="bg-red-500 text-white text-xs min-w-5 h-5 px-1 rounded-full flex items-center justify-center font-bold">
                      {g.noLeidos > 9 ? '9+' : g.noLeidos}
                    </span>
                  )}
                  <ChevronRight size={15} className="text-gray-300" />
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 shrink-0">
            {/* Mi perfil + cerrar sesión */}
            {miPerfil && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-7 h-7 rounded-full ${miRol.color} flex items-center justify-center text-xs text-white shrink-0`}>
                    {miRol.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-700 leading-none truncate">{miPerfil.nombre}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{miRol.etiqueta}</p>
                  </div>
                </div>
                <button
                  onClick={cerrarSesion}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold shrink-0 ml-2 transition-colors">
                  <LogOut size={13} /> Salir
                </button>
              </div>
            )}
            <div className="p-3">
              <button onClick={abrirNuevo}
                className={`w-full ${miRol.color} text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm hover:opacity-90 active:scale-95 transition-all`}>
                <Plus size={18} /> Nuevo chat o grupo
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══ MENSAJES ════════════════════════════════════════════════ */}
      {vista === 'mensajes' && grupoActivo && (
        <>
          <div className={`${miRol.color} text-white px-3 py-3 flex items-center gap-2 shrink-0`}>
            <button onClick={() => { setVista('lista'); setMensajes([]); setGrupoActivo(null) }}
              className="hover:bg-white/20 p-1.5 rounded-lg shrink-0 transition-colors">
              <ArrowLeft size={17} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{grupoActivo.nombre}</p>
              <p className="text-xs opacity-70">
                {grupoActivo.tipo === 'general' ? 'Todo el personal' :
                 grupoActivo.tipo === 'directo' ? 'Mensaje directo' : 'Grupo'}
              </p>
            </div>
            <button onClick={() => setVista('cerrado')} className="hover:bg-white/20 p-1.5 rounded-lg shrink-0 transition-colors">
              <X size={17} />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {mensajes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center">
                <MessageCircle size={32} className="mb-2 opacity-25" />
                <p className="text-sm font-medium">Sin mensajes aún</p>
                <p className="text-xs mt-1 opacity-70">¡Sé el primero en escribir!</p>
              </div>
            )}
            {mensajes.map(m => {
              const esMio = m.usuario_id === miId
              const rc    = rol(m.rol)
              return (
                <div key={m.id} className={`flex gap-2 ${esMio ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${rc.color} text-white`}>
                    {rc.emoji}
                  </div>
                  {/* Burbuja */}
                  <div className={`max-w-[73%] flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
                    {!esMio && (
                      <p className="text-[11px] text-gray-500 font-semibold mb-0.5 px-1">
                        {m.usuario_nombre}
                        <span className="font-normal text-gray-400"> · {rc.etiqueta}</span>
                      </p>
                    )}
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                      esMio
                        ? `${rc.color} text-white rounded-tr-sm`
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                    }`}>
                      {m.mensaje}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 px-1">{hora(m.created_at)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 bg-white shrink-0 flex gap-2">
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
            <button onClick={enviar} disabled={!texto.trim() || !miPerfil}
              className={`${miRol.color} hover:opacity-90 disabled:bg-gray-200 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-all active:scale-95 shrink-0`}>
              <Send size={16} />
            </button>
          </div>
        </>
      )}

      {/* ══ NUEVO CHAT ══════════════════════════════════════════════ */}
      {vista === 'nuevo' && (
        <>
          <div className={`${miRol.color} text-white px-3 py-3 flex items-center gap-2 shrink-0`}>
            <button onClick={() => { setVista('lista'); setSeleccion([]) }}
              className="hover:bg-white/20 p-1.5 rounded-lg shrink-0 transition-colors">
              <ArrowLeft size={17} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Nuevo chat</p>
              <p className="text-xs opacity-70">
                {seleccion.length === 0
                  ? 'Selecciona una o más personas'
                  : seleccion.length === 1
                  ? '1 persona — será mensaje directo'
                  : `${seleccion.length} personas — será grupo`}
              </p>
            </div>
          </div>

          {/* Lista de usuarios activos (dinámica) */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {usuarios.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-10">No hay otros usuarios activos</p>
            )}
            {usuarios.map(u => {
              const rc      = rol(u.rol)
              const checked = seleccion.includes(u.id)
              return (
                <button key={u.id}
                  onClick={() => setSeleccion(prev =>
                    prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id]
                  )}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${
                    checked ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}>
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm text-white shrink-0 ${rc.color}`}>
                    {rc.emoji}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{u.nombre}</p>
                    <p className="text-xs text-gray-400">{rc.etiqueta}</p>
                  </div>
                  {/* Checkbox visual */}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    checked ? `${miRol.color} border-transparent scale-110` : 'border-gray-300 bg-white'
                  }`}>
                    {checked && <span className="text-white text-[10px] font-black leading-none">✓</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Botón crear */}
          <div className="p-3 border-t border-gray-100 bg-white shrink-0 space-y-2">
            {/* Nombre del grupo (solo si 2+ seleccionados) */}
            {seleccion.length >= 2 && (
              <input
                type="text"
                value={nombreGrupo}
                onChange={e => setNombreGrupo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') crearChat() }}
                placeholder="Nombre del grupo (ej: Equipo piso 2)"
                maxLength={50}
                autoFocus
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            )}
            <button onClick={crearChat}
              disabled={seleccion.length === 0 || creando}
              className={`w-full ${miRol.color} disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-all active:scale-95`}>
              {creando
                ? '⏳ Creando...'
                : seleccion.length === 0
                ? 'Selecciona al menos 1 persona'
                : seleccion.length === 1
                ? `💬 Chat directo con ${usuarios.find(u => u.id === seleccion[0])?.nombre ?? '...'}`
                : `👥 Crear grupo (${seleccion.length + 1} personas)`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
