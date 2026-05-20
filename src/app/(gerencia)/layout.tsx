import ChatFlotante from '@/components/ChatFlotante'

export default function GerenciaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatFlotante />
    </>
  )
}
