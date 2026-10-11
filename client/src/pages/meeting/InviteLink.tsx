import { useState } from 'react'
import { Button } from '@src/components/Button'

export function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/m/${code}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('아래 링크를 복사해 주세요.', url)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input className="field-input flex-1" readOnly value={url} onFocus={(event) => event.target.select()} />
      <Button variant="secondary" onClick={handleCopy}>
        {copied ? '복사됨!' : '초대 링크 복사'}
      </Button>
    </div>
  )
}
