# Prepartita: analisi prepartita Serie A

Probabilità 1/X/2, gol attesi, over/under, gol/no gol, mappa dei risultati, scontri diretti e assenze stimate.
I dati arrivano da APIfootball.com (API v3) tramite tre funzioni server nella cartella `api/`: la chiave non finisce mai nel browser.

## 1. Chiave API
Prendila dal pannello di APIfootball (sezione "Your APIkey"). Non scriverla in nessun file del progetto e non condividerla in chat.

**Restrizione IP ("SET IP"):** lasciala vuota. Su Vercel gli indirizzi IP in uscita cambiano, quindi
con una restrizione attiva le richieste verrebbero rifiutate. Se vuoi bloccare la chiave a un IP, serve un server con IP fisso.

## 2. Metti online su Vercel
1. Crea un account su vercel.com e installa la CLI: `npm i -g vercel`
2. Nella cartella del progetto lancia `vercel` (accetta le impostazioni proposte)
3. Aggiungi la chiave: `vercel env add APIFOOTBALL_KEY` (Production, Preview, Development)
4. Pubblica: `vercel --prod`

In alternativa, dal sito di Vercel: importa la cartella (anche da GitHub) e aggiungi APIFOOTBALL_KEY in Settings, Environment Variables.

## Prova in locale
`APIFOOTBALL_KEY=la_tua_chiave vercel dev`

## Come funziona
- `api/serie-a.js`: classifica (gol fatti e subiti, in casa e fuori), risultati recenti per la forma, prossime 10 partite. Cache 10 minuti.
- `api/h2h.js`: ultimi 8 scontri diretti fra due squadre. Cache 24 ore.
- `api/injuries.js`: stima le assenze contando i giocatori segnalati come infortunati che hanno giocato almeno il 40% delle partite del più utilizzato della squadra (massimo 3). È una stima: nel sito si può correggere a mano. Cache 30 minuti.
- L'ID della Serie A viene cercato da solo tramite `get_leagues`. Se vuoi impostarlo a mano, aggiungi la variabile `SERIE_A_LEAGUE_ID`.

## Note
- Verifica che la Serie A sia inclusa nel tuo piano APIfootball e controlla i limiti di richieste dal pannello.
- Se il sito mostra "Impossibile caricare i dati", il messaggio indica il motivo (chiave mancante, piano senza Serie A, limite raggiunto).
