# Серверный контроль состояния

После обновления репозитория один раз установите внешний наблюдатель:

```bash
cd /root/viksstroy_bot
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp deploy/viksstroy-watchdog.service /etc/systemd/system/
cp deploy/viksstroy-watchdog.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now viksstroy-watchdog.timer
systemctl status viksstroy-watchdog.timer --no-pager
```

Наблюдатель запускается раз в минуту и проверяет внешний API, Docker,
SQLite, планировщик и зависшее обновление. Получатели и каналы берутся из
профилей активных суперадминов. Одинаковый сбой напоминается не чаще одного
раза в час; после восстановления отправляется отдельное сообщение.
