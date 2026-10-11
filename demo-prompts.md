# IUI 演示提示（自然语言 — 不用工具咒语）

## 资源看板
告诉我这台电脑现在的资源使用情况

## 天气
北京今天天气怎么样

## 表单 / 报名
帮我做一个简单报名表：姓名、方向、一句话目标

## 对比
对比一下方案 A 和方案 B 的成本与风险（用表格组件）

粘贴围栏冒烟（应使用 IUI 皮肤渲染）：

```iui
{"title":"本机资源","gap":12,"items":[{"type":"grid","cols":2,"items":[{"type":"stat","label":"CPU","value":"34%"},{"type":"stat","label":"内存","value":"8.2 / 16 GiB"},{"type":"progress","label":"磁盘","value":62},{"type":"stat","label":"负载","value":"1.2"}]}]}
```
