import ChatFlotante from '@/components/ChatFlotante'

export default function CocinaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatFlotante />
    </>
  )
}
