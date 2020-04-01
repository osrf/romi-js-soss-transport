# About

Transport for RoMi-js using SOSS.

Due to the limitations of SOSS some features are not support.
  * QoS options
  * Hosting a service

# Usage

This is bundled as an umd package, the simpliest way to use it would be to include it as a script in
your html.

```html
<script src="romi-js-soss-transport.js"></script>
```

This will add a `romi` global to the page, you can then get a transport like so.

```js
const transport = await romi.SossTransport.connect(name, url, token);
```
