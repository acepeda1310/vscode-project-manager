## Auto-detectar Repositórios Git

Simplesmente defina a configuração `baseFolders` com as pastas onde seus projetos estão localizados, e a extensão irá exibir todos os projetos Git localizados nelas. Se você precisar ignorar qualquer subpasta, você pode, usando padrões `glob`.

```json
    "projectManagerFork.git.baseFolders": [
        "c:\\Projects\\code",
        "d:\\MoreProjects\\code-testing",
        "$home\\personal-coding"
    ]
```

```json
    "projectManagerFork.git.ignoredFolders": [
        "node_modules", 
        "out", 
        "typings", 
        "test"
        "fork*"
    ],
```
