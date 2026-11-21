import { message, type Language } from '../cli-language.ts'
import type { ValidationCode } from '../types.ts'

type FieldMessage = {
  language: Language
  code: ValidationCode
  values?: Record<string, string>
}

const fieldMessages = {
  en: {
    destination: 'Choose a new or empty project directory.',
    badTitle: 'Enter a title on one line without control characters.',
    origin: 'Enter an HTTP or HTTPS URL without a path, query or fragment.',
    needsSeo: 'Enable SEO to set a public site URL.',
    clientSeo: 'Client rendering does not publish SEO metadata.',
    tag: 'Enter a valid BCP 47 language tag.',
    list: 'Enter at least one language and remove duplicates.',
    noTranslations:
      'Choose one application language when translations are off.',
    membership: 'Include the base language in your list.',
    clientLanguages: 'Choose one language for a client application.',
    conflict: 'Choose one of the two options.',
    invalid: 'Select one of the available options.'
  },
  'pt-BR': {
    destination: 'Escolha uma pasta nova ou vazia para o projeto.',
    badTitle: 'Digite um título em uma linha, sem caracteres de controle.',
    origin: 'Digite uma URL HTTP ou HTTPS sem caminho, consulta ou fragmento.',
    needsSeo: 'Ative o SEO para definir a URL pública do site.',
    clientSeo: 'A renderização no cliente não publica metadados de SEO.',
    tag: 'Digite um identificador de idioma BCP 47 válido.',
    list: 'Informe pelo menos um idioma e remova as repetições.',
    noTranslations:
      'Escolha um idioma para a aplicação com as traduções desativadas.',
    membership: 'Inclua o idioma base na lista.',
    clientLanguages: 'Escolha um idioma para a aplicação no modo cliente.',
    conflict: 'Escolha uma das duas opções.',
    invalid: 'Selecione uma das opções disponíveis.'
  },
  es: {
    destination: 'Elige una carpeta nueva o vacía para el proyecto.',
    badTitle: 'Escribe un título de una línea sin caracteres de control.',
    origin: 'Introduce una URL HTTP o HTTPS sin ruta, consulta ni fragmento.',
    needsSeo: 'Activa el SEO para definir la URL pública del sitio.',
    clientSeo: 'El renderizado en el cliente no publica metadatos SEO.',
    tag: 'Introduce una etiqueta de idioma BCP 47 válida.',
    list: 'Introduce al menos un idioma y elimina los duplicados.',
    noTranslations:
      'Elige un idioma para la aplicación con las traducciones desactivadas.',
    membership: 'Incluye el idioma base en la lista.',
    clientLanguages: 'Elige un idioma para la aplicación en modo cliente.',
    conflict: 'Elige una de las dos opciones.',
    invalid: 'Selecciona una de las opciones disponibles.'
  }
} as const

export function fieldMessage({
  language,
  code,
  values = {}
}: FieldMessage): string {
  if (code === 'occupied') return message(language, { code, values })
  return fieldMessages[language][code]
}
