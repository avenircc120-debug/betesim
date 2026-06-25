/**
 * Edge Function: publier-coupon
 * Sert la page web HTML du formulaire de publication de coupon.
 * Utilise le Telegram Web App SDK pour s'intégrer nativement.
 * Soumet les données à la fonction submit-coupon via fetch.
 */

const SUBMIT_URL = "https://mqwrhiffrtbkizyuiytt.supabase.co/functions/v1/submit-coupon";

const HTML = (eventId: string) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
  <title>Publier mon coupon — Betesim</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      --bg: #0f1117;
      --card: #1a1d27;
      --border: #2a2d3e;
      --accent: #4ade80;
      --accent2: #3b82f6;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --danger: #ef4444;
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 16px;
    }
    .header {
      text-align: center;
      padding: 20px 0 16px;
    }
    .header h1 { font-size: 1.4rem; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
    .header p  { font-size: 0.85rem; color: var(--muted); }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 16px;
    }
    .card h2 { font-size: 1rem; font-weight: 600; margin-bottom: 14px; color: var(--text); }

    .tiers {
      display: flex; gap: 8px; margin-bottom: 20px;
    }
    .tier {
      flex: 1; background: #0d1117; border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 6px; text-align: center;
    }
    .tier .odds { font-size: 0.7rem; color: var(--muted); margin-bottom: 4px; }
    .tier .gain { font-size: 1rem; font-weight: 700; color: var(--accent); }
    .tier.active { border-color: var(--accent); background: rgba(74,222,128,.08); }

    label {
      display: block; font-size: 0.8rem; color: var(--muted);
      margin-bottom: 6px; margin-top: 14px;
    }
    input {
      width: 100%; background: #0d1117;
      border: 1px solid var(--border); border-radius: 8px;
      padding: 12px 14px; color: var(--text);
      font-size: 1rem; outline: none;
      transition: border-color .2s;
    }
    input:focus { border-color: var(--accent2); }
    input::placeholder { color: #4a5568; }

    .gain-preview {
      display: none; margin-top: 16px;
      background: rgba(74,222,128,.1); border: 1px solid rgba(74,222,128,.3);
      border-radius: 8px; padding: 12px; text-align: center;
    }
    .gain-preview.show { display: block; }
    .gain-preview .amount { font-size: 1.4rem; font-weight: 700; color: var(--accent); }
    .gain-preview .label  { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }

    .btn {
      display: block; width: 100%;
      background: var(--accent); color: #000;
      border: none; border-radius: var(--radius);
      padding: 16px; font-size: 1rem; font-weight: 700;
      cursor: pointer; margin-top: 20px;
      transition: opacity .2s;
    }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn.loading::after { content: " ⏳"; }

    .error-msg {
      display: none; margin-top: 12px;
      background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3);
      border-radius: 8px; padding: 12px;
      color: var(--danger); font-size: 0.85rem; text-align: center;
    }
    .error-msg.show { display: block; }

    .success-screen {
      display: none; text-align: center; padding: 40px 20px;
    }
    .success-screen.show { display: block; }
    .success-screen .icon { font-size: 4rem; margin-bottom: 16px; }
    .success-screen h2 { font-size: 1.3rem; font-weight: 700; color: var(--accent); margin-bottom: 8px; }
    .success-screen p { color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
    .success-screen .credited {
      font-size: 2rem; font-weight: 800; color: var(--accent);
      margin: 16px 0 8px;
    }

    .form-container { }
  </style>
</head>
<body>
  <div class="form-container" id="formContainer">
    <div class="header">
      <h1>📤 Publier mon coupon</h1>
      <p>Saisis les détails de ton coupon 1Win</p>
    </div>

    <!-- Paliers de gains -->
    <div class="card">
      <h2>💰 Ton gain selon ta cote</h2>
      <div class="tiers">
        <div class="tier" id="tier1">
          <div class="odds">1.00 – 5.50</div>
          <div class="gain">250 FCFA</div>
        </div>
        <div class="tier" id="tier2">
          <div class="odds">5.51 – 16</div>
          <div class="gain">500 FCFA</div>
        </div>
        <div class="tier" id="tier3">
          <div class="odds">&gt; 16</div>
          <div class="gain">1 000 FCFA</div>
        </div>
      </div>
      <div class="gain-preview" id="gainPreview">
        <div class="amount" id="gainAmount">250 FCFA</div>
        <div class="label">Crédité dès la publication ✅</div>
      </div>
    </div>

    <!-- Formulaire -->
    <div class="card">
      <h2>🎫 Détails du coupon</h2>

      <label for="code">Code coupon 1Win *</label>
      <input
        id="code" type="text" inputmode="text"
        placeholder="Ex : ABC123456 ou 1WIN-XYZ99"
        autocomplete="off" autocorrect="off" autocapitalize="characters"
        spellcheck="false"
      />

      <label for="odds">Cote totale du coupon *</label>
      <input
        id="odds" type="number" inputmode="decimal"
        placeholder="Ex : 4.50 ou 12.5"
        step="0.01" min="1.01" max="100000"
      />

      <label for="temps">Heure des matchs *</label>
      <input
        id="temps" type="time"
        placeholder="Ex : 18:30"
      />

      <div class="error-msg" id="errorMsg"></div>

      <button class="btn" id="submitBtn" onclick="submitCoupon()">
        ✅ Publier et recevoir mon gain
      </button>
    </div>
  </div>

  <div class="success-screen" id="successScreen">
    <div class="icon">🎉</div>
    <h2>Coupon publié !</h2>
    <div class="credited" id="creditedAmount"></div>
    <p>Ton wallet a été crédité.<br/>Ferme cette fenêtre et consulte ton dashboard.</p>
  </div>

  <script>
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();

    // Récupérer event_id depuis l'URL
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event_id') || '';

    // Mettre à jour les paliers visuellement selon la cote saisie
    const oddsInput = document.getElementById('odds');
    const gainPreview = document.getElementById('gainPreview');
    const gainAmount = document.getElementById('gainAmount');
    const tiers = [document.getElementById('tier1'), document.getElementById('tier2'), document.getElementById('tier3')];

    function computeGain(odds) {
      if (!odds || odds < 1.01) return null;
      if (odds <= 5.50) return { gain: 250, tier: 0 };
      if (odds <= 16)   return { gain: 500, tier: 1 };
      return { gain: 1000, tier: 2 };
    }

    oddsInput.addEventListener('input', () => {
      const v = parseFloat(oddsInput.value.replace(',', '.'));
      tiers.forEach(t => t.classList.remove('active'));
      const r = computeGain(v);
      if (r) {
        tiers[r.tier].classList.add('active');
        gainAmount.textContent = r.gain.toLocaleString('fr-FR') + ' FCFA';
        gainPreview.classList.add('show');
      } else {
        gainPreview.classList.remove('show');
      }
    });

    // Soumission du formulaire
    async function submitCoupon() {
      const btn = document.getElementById('submitBtn');
      const errDiv = document.getElementById('errorMsg');
      errDiv.classList.remove('show');

      const code  = document.getElementById('code').value.trim().toUpperCase().replace(/\s+/g,'');
      const odds  = parseFloat(document.getElementById('odds').value.replace(',','.'));
      const temps = document.getElementById('temps').value;

      // Validations locales
      if (!code || code.length < 4 || code.length > 60) {
        showError('❌ Code coupon invalide (4–60 caractères).');
        return;
      }
      if (!odds || odds < 1.01) {
        showError('❌ Cote invalide. Entre un nombre comme 4.50 ou 12.5');
        return;
      }
      if (!temps) {
        showError('❌ Heure des matchs requise (ex : 18:30).');
        return;
      }

      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = 'Publication en cours…';

      try {
        const payload = {
          code,
          odds,
          temps,
          event_id: eventId,
          init_data: tg.initData || '',
        };

        const res = await fetch('${SUBMIT_URL}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          showError(data.error || 'Erreur serveur. Réessaie.');
          btn.disabled = false;
          btn.classList.remove('loading');
          btn.textContent = '✅ Publier et recevoir mon gain';
          return;
        }

        // Succès
        document.getElementById('formContainer').style.display = 'none';
        const successScreen = document.getElementById('successScreen');
        document.getElementById('creditedAmount').textContent =
          '+' + (data.gain_credited || 0).toLocaleString('fr-FR') + ' FCFA';
        successScreen.classList.add('show');

        // Fermer le WebApp après 3s
        setTimeout(() => tg.close(), 3000);

      } catch(e) {
        showError('❌ Erreur réseau. Vérifie ta connexion et réessaie.');
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = '✅ Publier et recevoir mon gain';
      }
    }

    function showError(msg) {
      const errDiv = document.getElementById('errorMsg');
      errDiv.textContent = msg;
      errDiv.classList.add('show');
    }
  </script>
</body>
</html>`;

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const eventId = url.searchParams.get("event_id") || "";

  return new Response(HTML(eventId), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      ...corsHeaders,
    },
  });
});
