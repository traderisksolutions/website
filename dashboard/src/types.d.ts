// Allow CSS side-effect imports (e.g. quill/dist/quill.snow.css)
declare module '*.css' {
  const content: Record<string, string>
  export default content
}
