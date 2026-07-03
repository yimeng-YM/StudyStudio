// react-syntax-highlighter 的语言子模块仅提供运行时定义（@types 未覆盖 languages/prism/*），
// 这里用通配声明统一标注类型，配合 PrismLight 按需注册语言使用。
declare module 'react-syntax-highlighter/dist/esm/languages/prism/*' {
  const value: any;
  export default value;
}