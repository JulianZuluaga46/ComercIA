# Despliegue en un servidor Ubuntu propio

El modo producción se comprobó en Windows: la API entrega la web y responde predicciones. Los pasos de Ubuntu aún no se
han ejecutado en un equipo real. Si alguno falla, anote el mensaje de error.

## Requisitos

- Ubuntu de 64 bits (`uname -m` debe decir `x86_64`). Recomendado: 24.04 y 4 GB de RAM (el consumo no se ha medido).
- Python 3.11 o superior (`python3 --version`). Ubuntu 22.04 trae 3.10, una versión no probada con este proyecto.
- Node.js 22.

## 1. Preparar el servidor

```bash
sudo apt update
sudo apt install -y python3-venv openssh-server curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo timedatectl set-timezone America/Bogota
```

Si es un portátil, para que siga encendido con la tapa cerrada, edite `/etc/systemd/logind.conf`:

```
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
```

```bash
sudo systemctl restart systemd-logind
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
hostname -I   # anote la IP
```

## 2. Copiar el proyecto (desde Windows)

Detenga `npm run dev` antes de copiar. El paquete incluye `server/.env`, la base y los modelos: no lo comparta.

```powershell
cd "C:\Users\pc\Downloads\Read Document"
tar -czf ..\comercia.tar.gz --exclude=node_modules --exclude=.venv --exclude=dist --exclude=__pycache__ .
scp ..\comercia.tar.gz USUARIO@IP:~/
```

## 3. Instalar y compilar (en el servidor)

```bash
mkdir -p ~/comercia && tar -xzf ~/comercia.tar.gz -C ~/comercia
cd ~/comercia
chmod 600 server/.env
npm run setup
(cd server && npx prisma generate)
npm run build
npm run build:api
```

Si la compilación dice `Cannot find module` con la palabra `linux` en el nombre, el `package-lock.json` hecho en Windows
no trae ese paquete. Ejecute `rm -rf node_modules package-lock.json && npm install` y compile de nuevo.

## 4. Probar

```bash
cd ~/comercia/server
NODE_ENV=production npm start
```

Abra `http://IP:3001` desde otro equipo de la misma red. Si las predicciones fallan por el modelo, las versiones de las
librerías de Python pueden ser distintas: reentrene en **Analista → Entrenamiento**. Detenga con `Ctrl+C`.

## 5. Dejarlo como servicio

Cree `/etc/systemd/system/comercia.service` (cambie `USUARIO`):

```ini
[Unit]
Description=ComercIA
After=network-online.target
Wants=network-online.target

[Service]
User=USUARIO
WorkingDirectory=/home/USUARIO/comercia/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now comercia
sudo systemctl status comercia
journalctl -u comercia -f     # ver el registro
sudo ufw allow OpenSSH
sudo ufw allow 3001/tcp
sudo ufw enable
```

Reserve la IP del servidor en el router para que no cambie.

## 6. Acceso desde internet

En la red local la conexión usa HTTP, sin cifrar. Para que entren comerciantes desde fuera se necesita HTTPS. La opción
más simple es **Cloudflare Tunnel**, que no abre puertos en el router.

- Prueba rápida, con una dirección temporal: instale `cloudflared` y ejecute `cloudflared tunnel --url http://localhost:3001`.
- Dirección fija: requiere un dominio propio en Cloudflare.

Con un túnel, quite la regla del puerto 3001: `sudo ufw delete allow 3001/tcp`.

## Actualizar

Excluya los datos para no sobrescribir los del servidor:

```powershell
tar -czf ..\comercia-update.tar.gz --exclude=node_modules --exclude=.venv --exclude=dist --exclude=__pycache__ --exclude=server/.env --exclude=server/prisma/dev.db --exclude=server/ml/models --exclude=server/backups .
scp ..\comercia-update.tar.gz USUARIO@IP:~/
```

```bash
tar -xzf ~/comercia-update.tar.gz -C ~/comercia
cd ~/comercia && npm run setup && npm run build && npm run build:api
sudo systemctl restart comercia
```

## Copias de seguridad

El sistema crea una copia diaria en `server/backups` y conserva 14, pero quedan en el mismo disco. Guarde copias en otro
equipo, junto con `server/.env`: sin `ENCRYPTION_KEY` los datos cifrados no se pueden leer.

```powershell
scp -r USUARIO@IP:~/comercia/server/backups .\respaldos-comercia
scp USUARIO@IP:~/comercia/server/.env .\respaldos-comercia\env-comercia
```

Para restaurar: detenga el servicio, copie la copia elegida sobre `server/prisma/dev.db` e inicie de nuevo.

## Disponibilidad (RNF-03)

Un portátil en casa depende de la luz, del internet y de un disco viejo, así que el 99 % mensual no está garantizado. Si
se quiere reportar ese requisito, mida la disponibilidad con un monitor externo (por ejemplo, UptimeRobot) contra
`/api/health`.
