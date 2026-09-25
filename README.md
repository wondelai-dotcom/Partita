# Prepartita: analisi prepartita dei principali campionati e delle coppe europee

## Cosa fa
Calcio: campionati (Serie A, Premier League, La Liga, Bundesliga, Ligue 1, Eredivisie, Primeira Liga), Champions ed Europa League, nazionali (qualificazioni Mondiali/Europei, Nations League, amichevoli, tornei finali quando attivi).
Tennis: i tornei più importanti in corso o vicini (Slam, Masters 1000/WTA 1000, Finals), con classifica ATP/WTA, scontri diretti e rendimento per superficie.
Probabilità 1/X/2, gol attesi, over/under, gol/no gol, mappa dei risultati, affidabilità dei dati, confronto con il modello di APIfootball,
formazioni e assenti (pesati per importanza), scontri diretti, partite del giorno, ricerca squadre e preferiti, immagine da condividere,
app installabile sul telefono, pagina "Precisione" con la verifica delle previsioni, commento scritto da un'AI (su richiesta).

## Le funzioni base non richiedono altro
Basta la variabile `APIFOOTBALL_KEY` su Vercel. Campionati, coppe, assenti pesati, ricerca, preferiti, immagine e app funzionano subito.

## Attivare la pagina "Precisione" (database gratuito)
1. Su Vercel apri il progetto, poi **Storage** e **Create Database**. Scegli **Upstash** (Redis), piano gratuito, e collegalo al progetto. Vercel aggiunge da solo le variabili di accesso.
2. In **Settings**, **Environment Variables** aggiungi `CRON_SECRET` con una stringa lunga a caso (per esempio 30 lettere e numeri). Serve a proteggere l'operazione giornaliera.
3. Fai **Redeploy** dell'ultimo deploy.
4. Ogni giorno alle 5:00 (ora UTC) l'operazione salva le previsioni dei tre giorni successivi e registra i risultati. Per provarla subito: **Settings**, **Cron Jobs**, **Run**.
5. Dopo alcuni giorni la scheda **Precisione** mostra i primi numeri. Oltre 150 partite verificate si attiva anche una piccola correzione automatica.

## Attivare il tennis
1. Registrati su api-tennis.com e prendi la chiave dalla tua area personale.
2. Su Vercel aggiungi la variabile `TENNIS_API_KEY` con quella chiave.
3. Fai **Redeploy**. Nella scheda "🎾 Tennis" in alto compaiono i tornei importanti trovati nei prossimi giorni; se in quel momento non ce ne sono, la scheda resta vuota (non è un errore).

## Attivare il commento AI
1. Crea un account su console.anthropic.com, aggiungi un piccolo credito e genera una chiave API.
2. Su Vercel aggiungi la variabile `ANTHROPIC_API_KEY`. Facoltativo: `AI_DAILY_CAP` per il numero massimo di commenti al giorno (predefinito 150).
3. Fai **Redeploy**. Compare il pulsante "Commento AI" sia nel calcio sia nel tennis. Il commento si genera solo quando lo chiedi, con un modello economico, e viene salvato per non pagare due volte la stessa partita.

Il commento può cercare da solo notizie recenti sul web (infortuni dell'ultima ora, formazioni, dichiarazioni) prima di scrivere, usando la funzione di ricerca integrata nell'API di Claude. Questo ha un costo aggiuntivo: 10 dollari ogni 1.000 ricerche, oltre al normale costo del testo. Ogni commento può fare fino a 4 ricerche (regolabile con la variabile `AI_MAX_SEARCHES`); il limite giornaliero di commenti (`AI_DAILY_CAP`) resta la protezione principale contro una spesa eccessiva. Quando il modello ha cercato sul web, le fonti compaiono come link sotto il commento.

## File
- `public/index.html`, `public/model.js`: sito e modello statistico (lo stesso codice gira anche sul server)
- `public/manifest.webmanifest`, `public/sw.js`, `public/icon-*.png`: app installabile
- `api/leagues.js`, `api/league.js` (con `_league.js`, `_cup.js`, `_nation.js`): campionati, coppe, nazionali, squadre, assenti, formazioni, previsioni
- `api/h2h.js`: scontri diretti
- `api/cron.js`, `api/accuracy.js`, `api/_track.js`: tracciamento e verifica delle previsioni
- `api/commento.js`: commento AI
- `api/_tennis.js`, `api/tennis-leagues.js`, `api/tennis-tournament.js`, `api/tennis-h2h.js`: sezione tennis (tornei, classifica ATP/WTA, scontri diretti, statistiche per superficie)
- `vercel.json`: operazione giornaliera e durata massima delle funzioni
`api/injuries.js` non serve più: si può eliminare.

## Limiti del tennis (prima versione)
- I tornei importanti si trovano guardando il calendario dei prossimi 35 giorni: se nessuno Slam/Masters è vicino, la scheda è vuota, è normale.
- Il modello usa classifica, forma stagionale, rendimento per superficie e scontri diretti, combinati con una formula semplice: non è ancora verificato sui risultati reali come quello del calcio (nessuna pagina "Precisione" per il tennis, per ora).
- Il piano gratuito di API-Tennis ha un limite di richieste: se compare un errore relativo al limite raggiunto, va verificato il piano sul loro sito.

## Limiti da conoscere
- Le coppe per club usano le valutazioni dei campionati nazionali corrette con un fattore di forza del campionato: è una stima indicativa, non calcolata dai dati. Le partite con squadre fuori dai 7 campionati non sono analizzabili.
- Le nazionali vengono scoperte automaticamente cercando il nome della competizione fra tutte quelle del tuo piano APIfootball (qualificazioni Mondiali/Europei, Nations League, amichevoli, tornei finali); ne compaiono al massimo 10 schede, con priorità a UEFA/Europa. Non usano una classifica di campionato: i valori vengono solo dalle ultime partite di ciascuna nazionale (fino a 18 mesi indietro), quindi sono meno solidi, specie per le squadre che giocano poco.
- Non è un vero punteggio Elo: quello richiede lo storico di più stagioni.
- Nessun modello elimina l'imprevedibilità del calcio. L'indicatore di affidabilità misura la qualità dei dati, non la certezza dell'esito.
