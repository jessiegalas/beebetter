import { X } from 'lucide-react'
import { type ReactNode, useId, useLayoutEffect, useRef } from 'react'

export function WorkspaceDialog({ title, description, children, onClose, busy = false }: {
  title: string
  description: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const id = useId()

  useLayoutEffect(() => {
    const dialog = ref.current
    const trigger = document.activeElement
    dialog?.showModal()
    heading.current?.focus()
    return () => {
      dialog?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  return <dialog ref={ref} className="workspace-dialog" aria-labelledby={id} aria-describedby={id + '-description'}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="workspace-dialog-header">
      <h2 id={id} ref={heading} tabIndex={-1}>{title}</h2>
      <button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      <p id={id + '-description'}>{description}</p>
    </header>
    {children}
  </dialog>
}
