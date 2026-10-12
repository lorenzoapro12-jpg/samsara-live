// ═══════════════════════════════════════════════════════════════════════════════
// APPRENDRE EN SE SERVANT DU SITE (plan §10 bis) — le cœur pur, sans dessin.
// ─────────────────────────────────────────────────────────────────────────────
// Pas de « mode apprendre » : le site apprend à lire le marché pendant qu'on s'en sert, en Lisible
// comme en Complet, sans surcharger l'écran.
//
//   1. CE QUI VIENT DE SE PASSER. Trois sources sont observées à chaque image du calque (le prix
//      live, environ chaque seconde) : les repères du Guide, ses figures, les scénarios du matin.
//      Chaque observation est comparée à la précédente de la MÊME source (sa « base ») : seul un
//      changement vu en direct fait un événement. La première observation d'un contexte (paire,
//      intervalle, mode, début de l'historique) n'est qu'une base : rien n'est dit au chargement
//      d'un état déjà passé. La page vide les bases (contexte null) dès que la vue ne suit plus la
//      dernière bougie ou que l'onglet est caché : rien n'est dit en parcourant le passé, ni en
//      revenant. Un événement n'est dit qu'une fois (sa clé est gardée) ; un passage de repère au
//      plus une fois par `passageMs` et par repère (un prix qui oscille ne répète rien).
//   2. LES MOTS. La ligne (ses variantes, de la plus riche à la plus courte) et sa bulle, en mots du
//      Lisible ou du Complet. Chaque mot dit exactement ce que la règle du code a constaté :
//      « cassé » = la règle de cassure du Guide (Guide.etatFerme : 2 fins de bougie au-delà de la
//      bande depuis la dernière traversée, la 2e éventuellement après un retour) ; « validée » =
//      la sortie d'une figure confirmée par sa machine d'état (Guide.avancer) ; « tombé » =
//      l'invalidation (une fin de bougie au-delà du niveau qui l'annule) ou l'annulation d'une
//      ébauche ; un scénario « touche » une zone quand une bougie la recoupe (Scenarios.pas).
//      Jamais un conseil, jamais une prévision ; chaque bulle finit par Guide.RISQUE.
//   3. « NOUVEAU ». Ce que ce visiteur a déjà ouvert (samsara-nouveau-v1 : les natures lues, une
//      liste JSON), et la marque à poser : une seule à la fois, sur la première nature jamais lue
//      dans l'ordre de NATURES. Le stockage peut manquer (navigation privée) : tout est lu et écrit
//      sous try/catch, et la page vit sans lui.
//   4. LES CHOIX DU COMPLET (samsara-apprendre-v1) : dire ce qui vient de se passer, marquer ce qui
//      est nouveau — chacun coupé d'un clic dans « Choisir l'affichage ». Le Lisible n'a pas de
//      choix : les deux y sont toujours.
// ═══════════════════════════════════════════════════════════════════════════════
const Apprendre = (function () {
  'use strict';
  const Gd = typeof Guide !== 'undefined' ? Guide : require('./guide.js');
  const fini = v => typeof v === 'number' && isFinite(v);

  // ─── 1. Ce qui vient de se passer ────────────────────────────────────────────
  /** L'ordre d'importance, du plus important au moins important — quand deux changements arrivent
   *  ensemble, seul le premier est dit (une ligne à la fois). D'abord ce qui NE TIENT PLUS (le
   *  scénario du matin, puis la figure dessinée : une lecture qui tombe se dit avant tout) ; puis
   *  ce qui est VALIDÉ (un repère cassé, une figure validée) ; puis ce qui est ATTEINT (scénario
   *  réalisé, cible d'une figure, cible d'un scénario) ; puis l'incertain (scénario indécis) ;
   *  puis ce qui est seulement EN COURS (un repère franchi, pas encore cassé) ; enfin les fins sans
   *  issue (figure sans suite, délai écoulé). Un message en cours n'est remplacé que par un
   *  événement au moins aussi important ; un moins important n'est pas dit (ni gardé pour plus tard). */
  const ORDRE = ['scenario_tombe', 'figure_tombee', 'repere_casse', 'figure_validee', 'scenario_realise', 'figure_atteinte', 'scenario_cible', 'scenario_indecis', 'repere_passe', 'figure_finie'];
  const rang = e => { const k = ORDRE.indexOf(e && e.type); return k < 0 ? ORDRE.length : k; };
  /** Un suivi vierge : le contexte, la base de chaque source, les clés déjà dites, l'heure du
   *  dernier passage dit de chaque repère. */
  const suivi = () => ({ ctx: null, base: {}, dits: new Set(), passages: new Map() });
  /** Le contexte de la page, ou null quand rien ne doit être dit (vue dans le passé, onglet caché,
   *  aide coupée). Un contexte nouveau, ou null, vide les bases. → true si elles ont été vidées. */
  function contexte(T, ctx) {
    if (ctx !== null && ctx === T.ctx) return false;
    const videes = T.ctx !== null || Object.keys(T.base).length > 0;
    T.ctx = ctx; T.base = {};
    return videes;
  }
  /** Une source qui n'est plus observée (couche masquée, plus de prix) : sa base est vidée ; elle
   *  repartira d'une base, sans rien dire. */
  function oublier(T, source) { delete T.base[source]; }

  /** Les états que garde chaque source, et les changements qu'elle sait dire.
   *  repère   x = { id, bas, haut, cassure ('valide' | 'demi' | null), sens, retest, affiche, niv }
   *           ([bas, haut] : la petite bande du repère en Lisible, la bande en Complet) ;
   *  figure   x = { id, cle (Guide.etatForme), f, affiche } ;
   *  scénario x = { id, cle (Scenarios.etat), k, haut (sortie par le haut), sc, affiche }.
   *  affiche : dessiné à l'écran (Lisible : les deux repères, la figure, le scénario montrés). */
  const FIN_FIGURE = ['atteint', 'invalide', 'abandon', 'sans_suite', 'oublie', 'devenu_triple'];
  const TYPE_FIGURE = { confirme: 'figure_validee', atteint: 'figure_atteinte', invalide: 'figure_tombee', abandon: 'figure_tombee', sans_suite: 'figure_finie', oublie: 'figure_finie' };
  const FIN_SCENARIO = ['realise', 'invalide', 'sortie', 'ambigu'];
  const TYPE_SCENARIO = { invalide: 'scenario_tombe', sortie: 'scenario_tombe', realise: 'scenario_realise', ambigu: 'scenario_indecis', cible: 'scenario_cible' };
  const SOURCES = {
    repere: {
      // Le côté du prix (± 1) ; sur le prix même ou dans la bande, le côté d'avant (pas de passage
      // sans être passé entièrement de l'autre côté).
      etat: (x, b, o) => ({ cote: o.live > x.haut ? 1 : o.live < x.bas ? -1 : b ? b.cote : 0, casse: x.cassure === 'valide' ? (x.sens > 0 ? 1 : -1) : 0, affiche: !!x.affiche }),
      changements(x, b, a, o, T) {
        const out = [], vu = x.affiche || b.affiche;
        if (!vu) return out;
        if (a.casse && a.casse !== b.casse) out.push({ type: 'repere_casse', source: 'repere', id: x.id, sens: a.casse, retest: !!x.retest, niv: x.niv, cle: 'casse|' + x.id + '|' + a.casse + '|' + o.tClos });
        else if (b.cote && a.cote && a.cote !== b.cote) {
          const der = T.passages.get(x.id);
          // Un passage dans le sens d'une cassure déjà validée n'apprend rien de neuf : rien n'est dit.
          if (!(a.casse === a.cote) && !(fini(der) && o.maintenant - der < (o.passageMs || 0))) {
            T.passages.set(x.id, o.maintenant);
            out.push({ type: 'repere_passe', source: 'repere', id: x.id, sens: a.cote, niv: x.niv, cle: 'passe|' + x.id + '|' + o.maintenant });
          }
        }
        return out;
      },
    },
    figure: {
      etat: x => ({ cle: x.cle, affiche: !!x.affiche }),
      changements(x, b, a) {
        const t = TYPE_FIGURE[a.cle];
        if (!x.affiche || a.cle === b.cle || !t || FIN_FIGURE.includes(b.cle)) return [];
        return [{ type: t, source: 'figure', id: x.id, f: x.f, cleEtat: a.cle, cle: 'figure|' + x.id + '|' + a.cle }];
      },
    },
    scenario: {
      etat: x => ({ cle: x.cle, k: x.k || 0, affiche: !!x.affiche }),
      changements(x, b, a) {
        const t = TYPE_SCENARIO[a.cle];
        if (!(x.affiche || b.affiche) || !t || FIN_SCENARIO.includes(b.cle)) return [];
        if (a.cle === b.cle && !(a.cle === 'cible' && a.k > b.k)) return [];
        return [{ type: t, source: 'scenario', id: x.id, sc: x.sc, k: a.k, haut: !!x.haut, cleEtat: a.cle, cle: 'scenario|' + x.id + '|' + a.cle + '|' + a.k }];
      },
    },
  };
  /** Compare l'observation `obs` (une liste d'éléments { id, … }) de la source à sa base : → les
   *  événements nouveaux (jamais dits). o = { live (prix), maintenant (ms), tClos (heure de la
   *  dernière bougie close), passageMs }. Un élément absent de l'observation sort de la base : s'il
   *  revient, il repart d'une base (un changement qui n'a pas été vu ne se dit pas). */
  function comparer(T, source, obs, o) {
    const S = SOURCES[source], avant = T.base[source] || null, apres = new Map(), out = [];
    if (!S) return out;
    for (const x of obs || []) {
      if (!x || x.id === undefined || x.id === null) continue;
      const b = avant ? avant.get(x.id) : null, a = S.etat(x, b, o || {});
      apres.set(x.id, a);
      if (b) out.push(...S.changements(x, b, a, o || {}, T));
    }
    T.base[source] = apres;
    if (T.dits.size > 500) T.dits.clear();
    return out.filter(e => (T.dits.has(e.cle) ? false : (T.dits.add(e.cle), true)));
  }
  /** Un message dit au PRÉSENT (« Prix au-dessus de X : pas encore cassé ») cesse d'être vrai quand
   *  le prix repasse de l'autre côté : → true, il est retiré (les autres disent un fait accompli). */
  function perime(T, e) {
    if (!e || e.type !== 'repere_passe') return false;
    const b = T.base.repere && T.base.repere.get(e.id);
    return !b || b.cote !== e.sens;
  }
  /** Le plus important des événements (ORDRE), ou null. */
  const choisir = evts => (evts || []).slice().sort((a, b) => rang(a) - rang(b))[0] || null;
  /** L'événement `e` prend-il la place du message en cours ? Seulement s'il est au moins aussi important. */
  const remplace = (actuel, e) => !!e && (!actuel || rang(e) <= rang(actuel));

  // ─── 2. Les mots ─────────────────────────────────────────────────────────────
  const periode = itv => (Gd.PERIODE_DEBUTANT && Gd.PERIODE_DEBUTANT[itv]) || ['une période', '2 périodes', 'cette période', 'périodes'];
  const nomScenario = sc => (sc && sc.rang === 'S' ? 'Scénario de la semaine' : 'Scénario ' + (sc ? sc.rang : ''));
  const ordinal = k => (k === 1 ? '1re' : k + 'e');
  const majuscule = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  // L'avertissement : UNE ligne courte en fin de bulle (charte du 12/10/2026), sans la ligne du
  // risque devant (deux phrases pour une seule idée).
  const FIN_DEBUTANT = 'Une description, pas une prévision ni un conseil.';
  const FIN_EXPERT = 'Une description, pas une recommandation.';
  /** Le repère en mots : son prix (celui de son libellé) et son nom (« le plus haut d'hier »). */
  function repereMots(niv, unite) {
    const r = niv ? Gd.raisonPrincipale(niv) : null;
    return { X: r ? Gd.prixR(r, unite) : niv ? Gd.prix(niv.p, unite) : '', N: r ? Gd.nomPhrase(r) : '' };
  }
  /** Les textes d'un événement : { variantes (ligne, de la plus riche à la plus courte), titre,
   *  texte (paragraphes de la bulle, le dernier est l'avertissement, une ligne courte), resume (Lisible :
   *  les phrases du 1er toucher, en variantes) }. mode 'debutant' | 'expert' ; o = { unite, itv }. */
  function textes(e, mode, o) {
    if (!e) return null;
    const c = o || {}, T = mode === 'expert' ? expert(e, c) : lisible(e, c);
    if (!T) return null;
    T.texte = T.texte.filter(Boolean);
    return T;
  }
  function lisible(e, o) {
    const P = periode(o.itv);
    if (e.source === 'repere') {
      const { X, N } = repereMots(e.niv, o.unite), haut = e.sens > 0, de = N ? ' (' + N + ')' : '';
      const au = haut ? 'au-dessus de ' + X : 'sous ' + X, cote = haut ? 'au-dessus' : 'en dessous';
      if (e.type === 'repere_passe') {
        const V = ['Prix ' + au + ' : cassé seulement si ' + P[1] + ' finissent ' + cote + '.', 'Prix ' + au + ' : pas encore cassé.', majuscule(au) + ', pas encore cassé.'];
        return { variantes: V, titre: 'Le prix passe un repère',
          texte: ['Le prix vient de passer ' + au + de + '.',
            '« Cassé » seulement si ' + P[1] + ' finissent ' + cote + '. Avant, le prix peut revenir.',
            FIN_DEBUTANT],
          resume: [['Le prix vient de passer ' + au + de + '.', 'Le prix vient de passer ' + au + '.'], ['« Cassé » : ' + P[1] + ' finis ' + cote + ' ; avant, le prix peut revenir.']] };
      }
      const V = ['Le prix a cassé ' + X + ' : ' + P[1] + ' ont fini ' + cote + ', c’est validé.', 'Le prix a cassé ' + X + ' : ' + P[1] + ' ont fini ' + cote + '.',
        'Repère ' + X + ' cassé ' + (haut ? 'vers le haut' : 'vers le bas') + '.'];
      return { variantes: V, titre: 'Repère cassé',
        texte: ['Le prix a cassé ' + X + de + ' : il est passé ' + cote + ' et ' + P[1] + ' ont fini de ce côté' + (e.retest ? ', avec un retour sur le repère entre les deux' : '') + '.',
          '« Cassé » : passé de l’autre côté, et resté. Le prix peut encore revenir.',
          FIN_DEBUTANT],
        resume: [['Le prix est passé ' + cote + ' de ' + X + de + ' et ' + P[1] + ' ont fini de ce côté.', 'Le prix est passé ' + cote + ' de ' + X + ' et ' + P[1] + ' ont fini de ce côté.'],
          ['C’est « cassé » : passé de l’autre côté, et resté.']] };
    }
    if (e.source === 'figure') {
      const f = e.f, nom = (Gd.NOM_FORME_DEBUTANT && Gd.NOM_FORME_DEBUTANT[f.type]) || 'Figure', fam = Gd.famille(f), sortie = fam === 'lignes' || fam === 'drapeau';
      const FIN = Gd.AVERTISSEMENT_FORME;
      if (e.type === 'figure_validee') {
        const s = f.sens > 0, tete = sortie ? nom + ' : sortie ' + (s ? 'en haut' : 'en bas') + ' validée' : nom + ' validé';
        const ou = sortie ? (s ? 'au-dessus' : 'en dessous') : (s ? 'au-dessus de sa ligne' : 'sous sa ligne');
        return { variantes: [tete + ' : ' + P[1] + ' ont fini ' + ou + '.', tete + '.'], titre: tete,
          texte: [tete + ' : ' + P[1] + ' ont fini ' + ou + '.',
            '« Validée » : sortie de sa ligne, et restée. Elle a une cible théorique, non garantie, et un niveau qui l’annule.', FIN],
          resume: [['Le prix est sorti ' + (s ? 'par le haut' : 'par le bas') + ' et ' + P[1] + ' ont fini ' + ou + '.'], ['C’est « validé » : sorti, et resté.']] };
      }
      if (e.type === 'figure_tombee') {
        if (e.cleEtat === 'abandon') {
          const tete = nom + ' possible annulé';
          return { variantes: [tete + ' : la figure ne s’est pas formée.', '✗ ' + tete + '.'], titre: tete,
            texte: [tete + ' : la figure ne s’est pas formée.', 'Il lui manquait son dernier point : elle ne compte plus.', FIN],
            resume: [['La figure possible ne s’est pas formée.'], ['Elle ne compte plus.']] };
        }
        const tete = nom + ' invalidé';
        return { variantes: [tete + ' : le prix a fini au-delà du niveau qui l’annule.', '✗ ' + tete + '.'], titre: tete,
          texte: [tete + ' : le prix a fini ' + P[0] + ' au-delà du niveau qui l’annule.',
            'Sa lecture ne tient plus. Aucune figure ne réussit à coup sûr.', FIN],
          resume: [['Le prix a fini au-delà du niveau qui annule la figure.'], ['Elle est « tombée » : sa lecture ne tient plus.']] };
      }
      if (e.type === 'figure_atteinte') {
        const tete = nom + ' : cible atteinte';
        return { variantes: [tete + ', ' + P[0] + ' a fini à la cible ou au-delà.', tete + '.'], titre: tete,
          texte: [tete + ' : ' + P[0] + ' a fini à la cible théorique ou au-delà.',
            'Cette cible est un usage des analystes, non garanti : l’atteindre ne dit rien de la suite.', FIN],
          resume: [[majuscule(P[0]) + ' a fini à la cible théorique ou au-delà.'], ['L’atteindre ne dit rien de la suite.']] };
      }
      if (e.type === 'figure_finie') {
        const sansSuite = e.cleEtat === 'sans_suite', tete = sansSuite ? nom + ' sans suite' : nom + ' : délai écoulé';
        const quoi = sansSuite ? (f.raison === 'pointe' ? 'le prix est resté dedans jusqu’à la pointe.' : 'le prix n’en est pas sorti à temps.') : 'ni la cible ni l’invalidation n’ont été atteintes.';
        return { variantes: [tete + (sansSuite ? ' : ' : ', ') + quoi, tete + '.'], titre: tete,
          texte: [tete + (sansSuite ? ' : ' : ', ') + quoi, 'Elle ne compte plus, ni comme réussite ni comme échec.', FIN],
          resume: [[majuscule(quoi)], ['Elle ne compte plus.']] };
      }
      return null;
    }
    if (e.source === 'scenario') {
      const sc = e.sc || {}, nomS = nomScenario(sc), n = (sc.cibles || []).length, FIN = 'Une hypothèse de Claude (une IA), pas une promesse ni un conseil.';
      const qui = 'Écrit le matin par Claude, une IA ; suivi en direct ici. La note officielle : le journal, le lendemain.';
      let tete, quoi, mot;
      if (e.type === 'scenario_cible') { tete = nomS + ' : ' + ordinal(e.k) + ' cible touchée'; quoi = 'le prix a atteint sa zone.'; mot = '« Touchée » : le prix est entré dans sa zone, même un instant.'; }
      else if (e.type === 'scenario_realise') { tete = nomS + ' réalisé'; quoi = 'le prix a touché ' + (n > 1 ? 'ses ' + n + ' cibles dans l’ordre' : 'sa cible') + (sc.invalidation !== null && sc.invalidation !== undefined ? ', avant l’invalidation.' : '.'); mot = 'Allé au bout de ce qu’il disait : cela ne dit rien de la suite.'; }
      else if (e.type === 'scenario_tombe' && e.cleEtat === 'sortie') { tete = nomS + ' sorti'; quoi = 'le prix a quitté ses bornes par le ' + (e.haut ? 'haut' : 'bas') + '.'; mot = 'Il disait que le prix resterait entre deux bornes : il ne tient plus.'; }
      else if (e.type === 'scenario_tombe') { tete = nomS + ' invalidé'; quoi = 'le prix a touché son invalidation avant ' + (n > 1 ? 'la dernière cible.' : 'la cible.'); mot = 'Le scénario ne tient plus.'; }
      else if (e.type === 'scenario_indecis') { tete = nomS + ' indécis'; quoi = 'deux de ses niveaux touchés en même temps, ordre inconnu.'; mot = 'Le journal tranchera, le lendemain.'; }
      else return null;
      // « Scénario 1 : 1re cible touchée, le prix… » : pas deux deux-points dans la même phrase.
      const sep = e.type === 'scenario_cible' ? ', ' : ' : ';
      return { variantes: [tete + sep + quoi, tete + '.'], titre: nomS + ' de Claude',
        texte: [tete + sep + quoi, mot, qui, FIN], resume: [[majuscule(quoi)], [mot]] };
    }
    return null;
  }
  function expert(e, o) {
    const titre = 'Ce qui vient de se passer';
    if (e.source === 'repere') {
      // La bande par ses prix (« 84 145 – 84 321 $ ») : ses raisons sont dans son libellé, à l'écran.
      const n = e.niv || {}, X = fini(n.pMin) && fini(n.pMax) && n.pMax > n.pMin ? Gd.chiffres(n.pMin) + ' – ' + Gd.prix(n.pMax, o.unite) : Gd.prix(n.p, o.unite), fl = e.sens > 0 ? '↑' : '↓';
      const regle = 'Cassure : 2 clôtures au-delà de la bande, ou 1 après un retour sur elle ; une mèche ne casse rien.';
      if (e.type === 'repere_passe') {
        const V = ['Niveau ' + X + ' franchi ' + fl + ' · bougie pas encore close : la cassure se juge en clôture', 'Niveau ' + X + ' franchi ' + fl + ' · non clos', X + ' franchi ' + fl];
        return { variantes: V, titre, texte: ['Le prix live est passé ' + (e.sens > 0 ? 'au-dessus' : 'en dessous') + ' de la bande ' + X + ' : au-delà, bougie pas encore close.', regle, FIN_EXPERT], resume: null };
      }
      const etat = 'cassé ' + (e.sens > 0 ? 'vers le haut' : 'vers le bas') + ' (' + (e.retest ? 'validé par un retour réussi' : '2/2 clôtures, validé') + ')';
      return { variantes: ['Niveau ' + X + ' : ' + etat, 'Niveau ' + X + ' cassé ' + fl + (e.retest ? ' · retour réussi' : ' 2/2'), X + ' cassé ' + fl],
        titre, texte: ['Niveau ' + X + ' : ' + etat + '.', regle, FIN_EXPERT], resume: null };
    }
    if (e.source === 'figure') {
      const f = e.f, nom = (Gd.NOMS_FORMES[f.type] || ['Figure'])[0], et = Gd.etatForme(f);
      const regle = 'Validation : 2 clôtures au-delà de la ligne (ou 1 + retour) ; invalidation : 1 clôture au-delà ; objectif jugé en clôture.';
      return { variantes: [nom + ' : ' + et.texte, nom + ' : ' + et.court], titre, texte: [nom + ' : ' + et.texte + '.', regle, 'Une lecture débattue, pas une recommandation.'], resume: null };
    }
    if (e.source === 'scenario') {
      const sc = e.sc || {}, nomS = nomScenario(sc);
      const etat = { scenario_cible: ordinal(e.k) + ' cible touchée', scenario_realise: 'réalisé', scenario_indecis: 'ambigu (même bougie, ordre inconnu)',
        scenario_tombe: e.cleEtat === 'sortie' ? 'sorti par le ' + (e.haut ? 'haut' : 'bas') : 'invalidé (invalidation touchée avant la dernière cible)' }[e.type];
      if (!etat) return null;
      return { variantes: [nomS + ' : ' + etat + ' · suivi en direct', nomS + ' : ' + etat], titre,
        texte: [nomS + ' : ' + etat + ' (suivi en direct).', 'Touchée : une bougie recoupe la zone. Note officielle : le journal, le lendemain.', 'Une hypothèse de Claude (une IA), pas une recommandation.'], resume: null };
    }
    return null;
  }

  // ─── 3. « Nouveau » ──────────────────────────────────────────────────────────
  const CLE_VUS = 'samsara-nouveau-v1', CLE_CHOIX = 'samsara-apprendre-v1', VUS_MAX = 300;
  /** L'ordre des marques : la phrase du Lisible, puis chaque sorte de repère, le scénario, chaque
   *  sorte de figure, les figures passées, enfin chaque sorte de « ce qui vient de se passer ».
   *  Une nature est « genre » ou « genre:sorte » (« repere:hier_haut », « figure:double_creux »). */
  const NATURES = ['phrase', 'repere', 'scenario', 'figure', 'passee', 'evenement'];
  const genre = cle => String(cle).split(':')[0];
  const magasin = s => { if (s !== undefined) return s; try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
  /** Les natures déjà lues (un Set) ; vide sans stockage ou s'il est illisible. */
  function lireVus(s) {
    const S = magasin(s);
    try {
      const a = JSON.parse((S && S.getItem(CLE_VUS)) || '[]');
      return new Set(Array.isArray(a) ? a.filter(x => typeof x === 'string') : []);
    } catch (e) { return new Set(); }
  }
  /** Note la nature `cle` lue (en mémoire, puis dans le stockage s'il répond). → true si elle était nouvelle. */
  function noterVu(vus, cle, s) {
    if (!cle || vus.has(cle)) return false;
    vus.add(cle);
    const S = magasin(s);
    try { if (S) S.setItem(CLE_VUS, JSON.stringify([...vus].slice(-VUS_MAX))); } catch (e) { /* navigation privée : en mémoire seulement */ }
    return true;
  }
  /** La marque à poser : parmi les candidats ({ cle, … }, dans l'ordre de l'écran), le premier jamais
   *  lu de la nature la mieux placée dans NATURES ; null si tout a été lu. */
  function choisirMarque(cands, vus) {
    let m = null, rm = Infinity;
    for (const c of cands || []) {
      if (!c || !c.cle || (vus && vus.has(c.cle))) continue;
      const k = NATURES.indexOf(genre(c.cle)), r = k < 0 ? NATURES.length : k;
      if (r < rm) { rm = r; m = c; }
    }
    return m;
  }

  // ─── 4. Les choix du Complet ─────────────────────────────────────────────────
  const CHOIX_DEFAUT = { evenements: true, marques: true };
  function lireChoix(s) {
    const o = Object.assign({}, CHOIX_DEFAUT), S = magasin(s);
    try {
      const m = JSON.parse((S && S.getItem(CLE_CHOIX)) || 'null');
      if (m && typeof m === 'object') for (const k of Object.keys(o)) if (typeof m[k] === 'boolean') o[k] = m[k];
    } catch (e) { /* illisible : les choix d'origine */ }
    return o;
  }
  function noterChoix(o, s) {
    const S = magasin(s);
    try { if (S) S.setItem(CLE_CHOIX, JSON.stringify({ evenements: !!o.evenements, marques: !!o.marques })); return true; } catch (e) { return false; }
  }

  return { ORDRE, rang, suivi, contexte, oublier, comparer, perime, choisir, remplace, textes, NATURES, genre, CLE_VUS, CLE_CHOIX, CHOIX_DEFAUT, lireVus, noterVu, choisirMarque, lireChoix, noterChoix };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Apprendre;
