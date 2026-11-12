# dsh-plugin-rss-digest — RSS Digest

Lee feeds RSS/Atom de hosts permitidos y genera un resumen Markdown con titulos, fechas y enlaces, con timeout y sin inventar contenido.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `digest` | Resumen del feed |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-rss-digest` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-rss-digest
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_RSS_DIGEST_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\rss-digest\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
