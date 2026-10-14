# Lista de empresas

`rastreadores.js` es una versión reducida de la lista pública de rastreadores de DuckDuckGo
([DuckDuckGo Tracker Blocklists](https://github.com/duckduckgo/tracker-blocklists)), que dice a qué
empresa pertenece cada dominio, qué hace y qué tanto usa técnicas de huella digital.

Esos datos tienen licencia [Creative Commons BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/):
se pueden usar y compartir sin fines comerciales, citando a DuckDuckGo y con la misma licencia.
Este archivo, como versión derivada, se comparte bajo esa misma licencia.

Para actualizarlo:

```
node herramientas/actualizar-lista.mjs
```

Los nombres en español, las categorías corregidas y las empresas que faltan en la lista están en
`src/empresas.js`, que es código propio de Huella.
