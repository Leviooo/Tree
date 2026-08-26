/// <reference types="vite/client" />

declare module 'mammoth/mammoth.browser' {
  interface MammothResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }
  const mammoth: {
    convertToHtml(
      input: { arrayBuffer: ArrayBuffer },
      options?: Record<string, unknown>,
    ): Promise<MammothResult>
  }
  export default mammoth
}
