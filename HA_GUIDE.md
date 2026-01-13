# 🏠 Home Assistant Deployment Guide: Örtendahls Familjecentral

Detta projekt är uppsatt som ett **Home Assistant Add-on**. Här är en förklaring av hur alla delar hänger ihop och hur du uppdaterar systemet.

## 🏗️ Arkitektur (Hur det hänger ihop)

1.  **Koden (Local)**: Du utvecklar appen (React Frontend + Node Backend) på din dator.
2.  **GitHub Repo**: Fungerar både som källkodslagring OCH som "Add-on Store" för din Home Assistant.
3.  **GitHub Actions**: En automatisk robot i molnet som bygger om koden till ett paket (Docker Image) varje gång du pushar.
4.  **GitHub Packages (ghcr.io)**: Här lagras det färdigbyggda paketet.
5.  **Home Assistant (Raspberry Pi)**: Hämtar och kör paketet inuti sin egen miljö.

```mermaid
graph LR
    Local[Din Dator] -- Push --> GitHub[GitHub Repo]
    GitHub -- Trigger --> Action[GitHub Actions Bot]
    Action -- Build --> Image[Docker Image (ghcr.io)]
    HA[Home Assistant] -- Polls --> GitHub
    HA -- Pulls --> Image
```

---

## 🚀 Hur du gör en uppdatering (Steg-för-steg)

För att få ut dina ändringar till Home Assistant, följ alltid denna process:

### 1. Öka versionsnummer
Öppna filen `familjecentralen/config.yaml`.
Ändra `version: "3.5.20"` till nästa nummer (t.ex. "3.5.21").
> ⚠️ **VIKTIGT:** Om du inte ändrar detta kommer Home Assistant inte fatta att det finns en uppdatering!

### 2. Pusha koden
Spara allt och skicka upp till GitHub:
```bash
git add .
git commit -m "Fixade en bugg och fixade designen"
git push
```

### 3. Vänta på bygget
Gå till din GitHub-sida -> Fliken **"Actions"**.
Du kommer se en arbetsflöde som heter "Deploy to Pi via Tailscale" (eller build-and-push) snurra.
Detta tar ca **2-5 minuter**. Den bygger appen för ARM64 (Raspberry Pi-processorn).

### 4. Uppdatera i Home Assistant
När Action är grön (✅):
1. Öppna Home Assistant.
2. Gå till **Inställningar** -> **Tillägg (Add-ons)**.
3. Om du inte ser uppdateringen direkt: Klicka på menyn (tre prickar) -> **"Sök efter uppdateringar"**.
4. Hitta "Örtendahls familjecentral".
5. Klicka **"Uppdatera"**.

---

## 📂 Viktiga filer för Home Assistant

*   **`familjecentralen/config.yaml`**: Add-on konfigurationen. Här styrs namn, version, och vilken port den körs på (ingress: true).
*   **`.github/workflows/deploy.yml`**: Instruktionsboken för GitHub Actions. Den säger "Använd Dockerfile för att bygga en image och lägg den på ghcr.io".
*   **`Dockerfile`**: Receptet för själva appen. (Installera Node, bygg React-appen, starta servern).

## 🛠️ Felsökning

**Uppdateringen syns inte i HA?**
*   Glömde du bumpa versionen i `config.yaml`?
*   Gick GitHub Action igenom (blev den grön)?
*   Testa "Sök efter uppdateringar" igen i HA Add-on butiken.

**Appen startar inte efter uppdatering?**
*   Kolla loggarna i Home Assistant (klicka på Add-onet -> Loggar).
*   Ofta beror det på något fel i `server/index.js` som kraschar vid start.
