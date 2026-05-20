import ChatFlotante from '@/components/ChatFlotante'

export default function MeseraLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatFlotante />
    </>
  )
}
