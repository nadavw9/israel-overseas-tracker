import { createContext, useContext } from 'react'
import { messages, type Locale, type Messages } from './messages'

type I18nValue = {
  locale: Locale
  messages: Messages
}

export const I18nContext = createContext<I18nValue>({
  locale: 'en',
  messages: messages.en,
})

export function useI18n() {
  return useContext(I18nContext)
}
