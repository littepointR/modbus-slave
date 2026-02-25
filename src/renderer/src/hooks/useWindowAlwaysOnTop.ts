import { useCallback, useEffect, useState } from 'react'

export const useWindowAlwaysOnTop = () => {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  useEffect(() => {
    window.api
      .getWindowAlwaysOnTop()
      .then((value) => setAlwaysOnTop(Boolean(value)))
      .catch(() => undefined)
  }, [])

  const setWindowAlwaysOnTop = useCallback((next: boolean) => {
    void window.api
      .setWindowAlwaysOnTop(next)
      .then((value) => setAlwaysOnTop(Boolean(value)))
      .catch(() => undefined)
  }, [])

  return {
    alwaysOnTop,
    setWindowAlwaysOnTop
  }
}

