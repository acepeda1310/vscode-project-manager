## Автоматическое определение Git-репозиториев

Просто укажите параметр `baseFolders` с папками, в которых находятся ваши проекты, и расширение покажет все Git-проекты, находящиеся в них. Если нужно игнорировать какие-либо подпапки, вы можете сделать это с помощью шаблонов `glob`.

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
