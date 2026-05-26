/**
 * Local Army BC response engine (fallback when ?armyBcLocal=1 or Edge errors).
 */
(function (global) {
  const CATALOG_URL = '/army-bc/army-role-catalog.json';
  const CONFIG_URL = '/army-bc/army-bc-agent-config.json';

  let catalog = [];
  let agentConfig = null;
  let loadPromise = null;

  function loadData() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch(CATALOG_URL).then((r) => (r.ok ? r.json() : [])),
      fetch(CONFIG_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([cat, cfg]) => {
      catalog = Array.isArray(cat) ? cat : [];
      agentConfig = cfg;
      return { catalog, agentConfig };
    });
    return loadPromise;
  }

  function norm(s) {
    return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function extractUserMessage(payload) {
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
    if (global.__armyBcLastUserText) return global.__armyBcLastUserText;
    const conv = payload?.xdm?.conversation || payload?.data?.conversation || payload?.conversation;
    if (typeof conv?.message === 'string' && conv.message.trim()) return conv.message.trim();
    if (typeof conv?.request?.message === 'string' && conv.request.message.trim()) {
      return conv.request.message.trim();
    }
    if (Array.isArray(conv?.raw)) {
      const parts = conv.raw
        .filter((r) => /user/i.test(r?.purpose || ''))
        .map((r) => r?.text)
        .filter(Boolean);
      if (parts.length) return parts.join(' ').trim();
    }
    const dataMsg = payload?.data?.message || payload?.xdm?.message;
    if (typeof dataMsg === 'string' && dataMsg.trim()) return dataMsg.trim();
    try {
      const raw = JSON.stringify(payload || {});
      const m = raw.match(/"message":"((?:\\.|[^"\\])*)"/);
      if (m) return JSON.parse('"' + m[1] + '"');
    } catch (_) {
      /* ignore */
    }
    return '';
  }

  function parseQualifications(text) {
    const t = norm(text);
    if (/scottish national|national 5/.test(t)) return 'Scottish National 5s';
    if (/a levels?/.test(t)) return 'A levels';
    if (/gcse/.test(t)) return 'GCSEs';
    if (/degree|graduate/.test(t)) return 'degree';
    if (/no formal/.test(t)) return 'no formal qualifications';
    return null;
  }

  function parseAge(text) {
    const m = text.match(/(\d{1,2})\s*years?\s*(?:and\s*(\d{1,2})\s*months?)?/i);
    if (m) {
      const years = parseInt(m[1], 10);
      const months = m[2] ? parseInt(m[2], 10) : 0;
      return { years, months, label: months ? `${years} years and ${months} months` : `${years} years old` };
    }
    const simple = text.match(/\b(?:i am|i'm|age[d]?)\s*(\d{1,2})\b/i);
    if (simple) {
      const years = parseInt(simple[1], 10);
      return { years, months: 0, label: `${years}-year-old` };
    }
    return null;
  }

  function wantsTeamBasedActiveRecommend(text) {
    const t = norm(text);
    return (
      /recommend|suggest/.test(t) &&
      /roles?/.test(t) &&
      /team[- ]?based|teamwork|team work/.test(t) &&
      /\bactive\b/.test(t)
    );
  }

  function findCatalogRole(slugPart) {
    return catalog.find(function (p) {
      return (p.productPageURL || '').includes(slugPart);
    });
  }

  function pickTeamBasedActiveRoles(limit) {
    const order = ['infantry-soldier', 'general-fitter', 'network-engineer'];
    const picked = [];
    order.forEach(function (slug) {
      const hit = findCatalogRole(slug);
      if (hit) picked.push(hit);
    });
    return picked.slice(0, limit || 3);
  }

  function parseRequestedCount(text) {
    const t = norm(text);
    const range = t.match(/recommend\s+(\d)\s*(?:to|-)\s*(\d)/);
    if (range) return Math.min(3, Math.max(2, parseInt(range[2], 10)));
    const exact = t.match(/recommend\s+(\d)\b/);
    if (exact) return Math.min(3, Math.max(2, parseInt(exact[1], 10)));
    if (/2 to 3|2-3|two to three/.test(t)) return 3;
    return 3;
  }

  function isRoyalSignalsRole(p) {
    return /royal-signals/.test(p.productPageURL || '');
  }

  function matchesItCyberNetworks(p) {
    const blob = norm(
      [p.productName, p.productDescription, p.productCategoryDescription, p.productCatalogName].join(' ')
    );
    return /cyber|network|signals|it\b|information services|electronic warfare|communications|software|digital|intelligence/.test(
      blob
    );
  }

  function displayRoleName(p) {
    const url = p.productPageURL || '';
    if (/cyber-engineer/.test(url)) return 'Cyber Engineer';
    if (/electronic-warfare/.test(url)) return 'Electronic Warfare Operator';
    if (/information-services-engineer/.test(url)) return 'Information Services Engineer';
    return p.productName;
  }

  const ROLE_DETAIL_BULLETS = {
    'Cyber Engineer': [
      'Protect and defend Army networks from cyber threats.',
      'Work with cybersecurity tools and IT systems to maintain secure communications.',
      'Requires strong problem-solving skills and an interest in technology.',
    ],
    'Network Engineer': [
      'Design, maintain, and secure communication networks for the Army.',
      'Involves configuring and troubleshooting network hardware and software.',
      'Ideal for those interested in network infrastructure and cyber defence.',
    ],
    'Combat Cyber Operator': [
      'Detect and defend against cyber threats on Army digital networks.',
      'Work in technical, team-focused environments with cutting-edge tools.',
      'Suits applicants with GCSEs who are interested in IT and cyber security.',
    ],
    'Information Services Engineer': [
      'Manage IT systems, software and secure data services for the Army.',
      'Support operational communications with reliable technology.',
      'A strong fit if you enjoy problem-solving and working with computers.',
    ],
    'Electronic Warfare Operator': [
      'Use electronic systems to intercept and disrupt enemy communications.',
      'Combines technical skills with intelligence and tactical operations.',
      'Suitable if you enjoy technology and operational roles.',
    ],
    'Communications Engineer': [
      'Develop and maintain communication systems for military operations.',
      'Apply engineering and IT skills in the field and on base.',
      'Requires interest in technology and teamwork under pressure.',
    ],
    'Infantry Soldier': [
      'Frontline combat role with a strong focus on teamwork, fitness, and operational readiness.',
      'Involves field exercises, weapons training, and deployment on operations worldwide.',
      'Ideal if you want an active, hands-on career with clear progression to leadership.',
    ],
    'Royal Engineer (Combat Engineer)': [
      'Build, maintain, and clear obstacles in support of combat operations as part of a close-knit team.',
      'Combines practical engineering skills with fieldcraft on exercises and deployments.',
      'Suits applicants with GCSEs who enjoy problem-solving and active, outdoor work.',
    ],
    'Cyber Network Engineer': [
      'Design, secure, and maintain Army communication networks used on operations.',
      'Work in technical teams with cutting-edge IT and cyber defence tools.',
      'Strong fit for GCSE holders interested in technology, networks, and teamwork.',
    ],
  };

  const ROYAL_SIGNALS_IT_SLUGS = [
    'cyber-engineer',
    'network-engineer',
    'electronic-warfare',
    'information-services-engineer',
    'combat-cyber-operator',
    'comms-engineer-systems-operator',
    'communication-infrastructure-engineer',
  ];

  function sortRolesBySlugOrder(roles, slugs) {
    return roles.slice().sort(function (a, b) {
      const urlA = a.productPageURL || '';
      const urlB = b.productPageURL || '';
      const ia = slugs.findIndex(function (s) {
        return urlA.includes(s);
      });
      const ib = slugs.findIndex(function (s) {
        return urlB.includes(s);
      });
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  function topicFromText(text) {
    const intent = intentFromText(text);
    if (intent.kind === 'area') return intent.area;
    return intent.kind;
  }

  /** Primary intent (check specific questions before broad role browsing). */
  function intentFromText(text) {
    const t = norm(text);
    if (/about the army/.test(t)) return { kind: 'about' };
    if (/army life/.test(t)) return { kind: 'life' };
    if (/\bevents?\b|recruitment event|meet the army/.test(t)) return { kind: 'events' };
    if (
      /fitness test|assessment centre|army assessment|beep test|multi-?stage fitness|ipft|physical fitness test|mid thigh pull|medicine ball/.test(
        t
      )
    ) {
      return { kind: 'fitness' };
    }
    if (/how (?:do|can) i apply|how to apply|start my application|application process|apply online/.test(t)) {
      return { kind: 'apply' };
    }
    if (/recommend|suggest|please recommend/.test(t) && /roles?/.test(t)) {
      return { kind: 'recommend' };
    }
    if (/entry requirement|eligibility criteria|am i eligible/.test(t)) {
      return { kind: 'eligibility' };
    }
    if (/career progression|progression pathway/.test(t)) return { kind: 'progression' };
    if (/what training|training (?:involve|provided|like)/.test(t)) return { kind: 'training' };
    if (/cyber|hacking|it role|computer|network engineer/.test(t)) return { kind: 'area', area: 'cyber' };
    if (/engineer|engineering|electric|fabricat|reme\b/.test(t)) return { kind: 'area', area: 'engineering' };
    if (/infantry|combat|soldier|paratrooper|tank/.test(t)) return { kind: 'area', area: 'combat' };
    if (/intelligence|analyst/.test(t)) return { kind: 'area', area: 'intelligence' };
    if (/logistic|driver|supply|petroleum/.test(t)) return { kind: 'area', area: 'logistics' };
    if (/medical|nurse|doctor|physio/.test(t)) return { kind: 'area', area: 'medical' };
    if (/officer/.test(t)) return { kind: 'area', area: 'officer' };
    return { kind: 'general' };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function pickUniqueSuggestions(candidates, count) {
    const seen = new Set();
    const out = [];
    shuffle(candidates).forEach(function (s) {
      const key = norm(s);
      if (out.length >= count || seen.has(key)) return;
      seen.add(key);
      out.push(s);
    });
    return out;
  }

  function findExplicitRoleInText(text) {
    const t = norm(text);
    const byLength = catalog.slice().sort((a, b) => b.productName.length - a.productName.length);
    for (let i = 0; i < byLength.length; i++) {
      const p = byLength[i];
      const name = norm(p.productName);
      if (name.length >= 5 && t.includes(name)) return p;
    }
    const aliases = [
      ['cyber operator', /combat cyber/i],
      ['network engineer', /^network engineer$/i],
      ['vehicle mechanic', /vehicle mechanic/i],
      ['general fitter', /general fitter/i],
      ['infantry soldier', /infantry soldier/i],
      ['petroleum operator', /petroleum operator/i],
    ];
    for (let a = 0; a < aliases.length; a++) {
      if (t.includes(aliases[a][0])) {
        const hit = catalog.find((p) => aliases[a][1].test(p.productName));
        if (hit) return hit;
      }
    }
    return null;
  }

  function findRoleInText(text) {
    const explicit = findExplicitRoleInText(text);
    if (explicit) return explicit;
    const picked = pickRoles(text, 1);
    return picked[0] || null;
  }

  function isGeneralArmyEligibilityQuestion(text) {
    const t = norm(text);
    if (!/eligibility|entry requirement|am i eligible|requirements to join|who can join/.test(t)) {
      return false;
    }
    if (findExplicitRoleInText(text)) return false;
    return (
      /joining the british army|join the british army|joining the army|join the army/.test(t) ||
      /eligibility criteria for joining/.test(t) ||
      /(?:general|overall|basic)\s+(?:eligibility|entry|requirements)/.test(t) ||
      !/for (?:the\s+)?[\w\s-]{4,}\s+role\b/.test(t)
    );
  }

  function typicalEntryLine(role) {
    const qual = role?.productSubcategoryName;
    if (qual && !/see qualification/i.test(qual)) {
      return qual + ' (confirm on the official role page)';
    }
    return 'GCSEs including Maths and English (confirm on the official role page)';
  }

  function scoreProduct(p, text, topic) {
    const blob = norm(
      [p.productName, p.productDescription, p.productCategoryDescription, p.productCatalogName].join(' ')
    );
    let score = 0;
    const t = norm(text);

    const topicKeywords = {
      cyber: ['cyber', 'network', 'signals', 'it', 'software', 'digital', 'information services'],
      engineering: ['engineer', 'electrical', 'mechanical', 'fabricat', 'electric', 'technical', 'reme'],
      combat: ['infantry', 'combat', 'armoured', 'paratrooper', 'tank', 'guards'],
      intelligence: ['intelligence', 'operator military'],
      logistics: ['logistic', 'driver', 'supply', 'petroleum', 'transport'],
      medical: ['medical', 'nurse', 'doctor', 'physio', 'health'],
      officer: ['officer'],
    };

    (topicKeywords[topic] || []).forEach((kw) => {
      if (blob.includes(kw)) score += 4;
    });

    t.split(/\W+/).forEach((w) => {
      if (w.length > 3 && blob.includes(w)) score += 1;
    });

    if (p.productCatalogName && t.includes(norm(p.productCatalogName))) score += 3;
    if (p.productImageURL) score += 0.5;
    return score;
  }

  function pickRoles(text, limit, filters) {
    const topic = topicFromText(text);
    const qual = parseQualifications(text);
    const t = norm(text);
    let pool = catalog.slice();
    const f = filters || {};

    if (f.corps === 'royal-signals' || /royal signals/.test(t)) {
      pool = pool.filter(isRoyalSignalsRole);
    }

    if (f.itCyberOnly || /it\b|, networks|network or cyber|networks or cyber/.test(t)) {
      pool = pool.filter(matchesItCyberNetworks);
    }

    if (qual) {
      const q = norm(qual);
      const filtered = pool.filter((p) => {
        const sub = norm(p.productSubcategoryName);
        return sub.includes(q) || q.includes(sub) || sub.includes('see qualification');
      });
      if (filtered.length >= Math.min(2, limit)) pool = filtered;
    }

    if (topic === 'officer') {
      pool = pool.filter((p) => /officer/i.test(p.productName + p.productPageURL));
    } else if (topic !== 'general' && topic !== 'about' && topic !== 'life' && topic !== 'events' && topic !== 'recommend') {
      const scored = pool
        .map((p) => ({ p, s: scoreProduct(p, text, topic) }))
        .sort((a, b) => b.s - a.s);
      pool = scored.filter((x) => x.s > 0).map((x) => x.p);
      if (pool.length < 2) pool = scored.slice(0, 12).map((x) => x.p);
    }

    if (f.corps === 'royal-signals' || /royal signals/.test(t)) {
      pool = sortRolesBySlugOrder(pool, ROYAL_SIGNALS_IT_SLUGS);
    } else {
      const ranked = pool
        .map((p) => ({ p, s: scoreProduct(p, text, topic) }))
        .sort((a, b) => b.s - a.s);
      pool = ranked.map((x) => x.p);
    }

    return pool.slice(0, limit);
  }

  function corpsLabel(url, name) {
    const m = (url || '').match(/\/roles\/([^/]+)\//);
    if (!m) return 'British Army';
    const slug = m[1].replace(/-/g, ' ');
    return slug.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function mdLink(label, url) {
    return url ? `[${label}](${url})` : label;
  }

  function teamBasedRoleLabel(p) {
    const url = p.productPageURL || '';
    if (/infantry-soldier/.test(url)) return 'Infantry Soldier';
    if (/general-fitter/.test(url)) return 'Royal Engineer (Combat Engineer)';
    if (/network-engineer/.test(url)) return 'Cyber Network Engineer';
    return displayRoleName(p);
  }

  function formatRoleListTitle(p, index, options) {
    const url = p.productPageURL || '';
    const n = index + 1;
    if (options && options.teamBasedActive) {
      if (/infantry-soldier/.test(url)) {
        return `**${n}. ${mdLink('Infantry Soldier', url)}**`;
      }
      if (/general-fitter/.test(url)) {
        return `**${n}. Royal Engineers — ${mdLink('Royal Engineer (Combat Engineer)', url)}**`;
      }
      if (/network-engineer/.test(url)) {
        return `**${n}. Royal Signals — ${mdLink('Cyber Network Engineer', url)}**`;
      }
    }
    return `**${n}. ${mdLink(displayRoleName(p), url)}**`;
  }

  function roleDetailBullets(p, options) {
    const opts = options || {};
    const url = p.productPageURL || '';
    if (opts.teamBasedActive) {
      const teamLabel = teamBasedRoleLabel(p);
      if (ROLE_DETAIL_BULLETS[teamLabel]) return ROLE_DETAIL_BULLETS[teamLabel].slice();
    }
    const name = displayRoleName(p);
    if (ROLE_DETAIL_BULLETS[name]) return ROLE_DETAIL_BULLETS[name].slice();
    const lines = [];
    if (p.productDescription) lines.push(p.productDescription + '.');
    const qual = p.productSubcategoryName;
    if (qual && !/see qualification/i.test(qual)) {
      lines.push(`Typical entry: ${qual} (confirm on the official role page).`);
    }
    if (lines.length < 3) {
      lines.push('Training and career progression are outlined on the official role page.');
    }
    return lines.slice(0, 3);
  }

  function buildRecommendIntro(text, roles, options) {
    const qual = parseQualifications(text) || options.qualHint;
    const age = parseAge(text);
    const corps = options.corpsLabel;
    const n = roles.length;
    const t = norm(text);

    if (corps === 'Royal Signals' && /it|network|cyber/.test(t)) {
      const qualPhrase = qual === 'GCSEs' ? 'GCSE qualifications' : qual || 'your qualifications';
      if (age && age.years >= 16) {
        return `Here are ${n} Royal Signals roles related to IT, networks, and cyber that suit your age (${age.label}) and ${qualPhrase}:`;
      }
      return `Here are ${n} Royal Signals roles related to IT, networks, and cyber that suit your ${qualPhrase}:`;
    }

    if (topicFromText(text) === 'cyber') {
      return age
        ? `Here are ${n} British Army cyber roles that may suit your age (${age.label}) and qualifications:`
        : `Here are ${n} British Army cyber roles that might suit your interests:`;
    }

    if (options.teamBasedActive) {
      const qual = parseQualifications(text) || 'GCSEs';
      if (age && age.years >= 16) {
        return `Here are ${n} active, team-based British Army roles suited to an ${age.years}-year-old with ${qual}:`;
      }
      return `Here are ${n} active, team-based British Army roles suited to applicants with ${qual}:`;
    }

    return `Here are ${n} British Army roles that may suit your interests:`;
  }

  function buildAboutArmyMessage() {
    const intro =
      'The British Army is the land warfare branch of the UK Armed Forces, offering a wide range of career opportunities across combat, technical, support, and leadership roles. Army life combines teamwork, discipline, and personal development, with training designed to prepare you for operational duties both in the UK and overseas.';
    const aspects = [
      'Comprehensive training and continuous professional development',
      'Opportunities in diverse roles such as infantry, engineering, cyber, logistics, and communications',
      'Access to education, qualifications, and career progression pathways',
      'A strong support network for health, welfare, and family life',
      'The chance to contribute to national security and international missions',
    ];
    return (
      intro +
      '\n\n**Key aspects of Army life include:**\n\n' +
      aspects.map((a) => `- ${a}`).join('\n') +
      '\n\nIf you would like, I can recommend specific roles based on your interests, qualifications, or career goals. What areas appeal to you most — combat, technology, leadership, engineering, or something else?'
    );
  }

  function buildArmyLifeMessage() {
    return (
      'Army life centres on structured training, strong teamwork, and clear career pathways. You gain qualifications, travel opportunities, and welfare support for you and your family while serving in the UK and on operations overseas.\n\n' +
      'Tell me what you would like to explore next — training, benefits, or roles that match your skills and qualifications.'
    );
  }

  function buildEventsMessage() {
    return (
      'You can meet the Army at recruitment events and through official channels online. These are a good way to speak to recruiters and learn about roles that match your interests.\n\n' +
      'Would you like to explore roles by area (for example cyber, engineering, or combat) or browse the official role finder?'
    );
  }

  function buildApplyMessage(role) {
    const name = role.productName;
    const url = role.productPageURL;
    const entry = typicalEntryLine(role);
    const extra = role.productDescription ? `- ${role.productDescription}\n` : '';

    return (
      `To apply for the **${name}** role in the British Army, follow these steps:\n\n` +
      `**1. Check eligibility**\n` +
      `- Be aged 16 to 35 (exact limits may vary by role).\n` +
      `- Meet education requirements (typically ${entry}).\n` +
      extra +
      `- Pass medical assessments and security checks (enhanced vetting may apply for some roles).\n\n` +
      `**2. Prepare your application**\n` +
      `- Gather personal details, qualifications, and any relevant experience.\n` +
      `- Be ready to explain why this role matches your skills and interests.\n\n` +
      `**3. Apply online**\n` +
      `- Visit the official role page: ${mdLink(name + ' – Learn more / Apply', url)}\n` +
      `- Complete the online application form on Army Jobs.\n\n` +
      `**4. Selection process**\n` +
      `- If your application is successful, you will be invited to the Army Assessment Centre.\n` +
      `- This includes fitness tests, aptitude tests, interviews, and medical assessments.\n\n` +
      `**5. Training**\n` +
      `- On selection, you begin basic training followed by specialist training for your trade.\n\n` +
      `If you want, I can guide you through assessment preparation or explain fitness requirements for this role. Would you like that?`
    );
  }

  function buildFitnessMessage(text) {
    const role = findRoleInText(text);
    const roleNote = role
      ? `\n\nStandards can vary slightly by role — check the ${mdLink(role.productName + ' role page', role.productPageURL)} for any trade-specific requirements.`
      : '';

    return (
      'The Army Assessment Centre fitness tests typically include the following key components to assess your physical readiness:\n\n' +
      '**1. Multi-Stage Fitness Test (beep test)**\n' +
      '- Measures cardiovascular endurance.\n' +
      '- You run back and forth over a 20-metre distance, keeping pace with audio beeps that gradually increase in speed.\n\n' +
      '**2. Strength and endurance tests**\n' +
      '- May include exercises such as press-ups and sit-ups to assess muscular strength and endurance.\n' +
      '- Some assessments also include components such as mid thigh pull and medicine ball throw.\n\n' +
      '**3. Individual Physical Fitness Test (IPFT)**\n' +
      '- Often includes a 2 km run, press-ups, and sit-ups.\n' +
      '- Each element has minimum standards based on age and gender.\n\n' +
      '**4. Additional role-specific tests**\n' +
      '- Some roles may require extra physical assessments, such as loaded marches or agility tests.\n\n' +
      'These tests ensure you meet the physical standards required for Army training and service.\n\n' +
      'For detailed guidance and preparation tips, visit the [British Army Assessment Centre](https://apply.army.mod.uk/how-to-join/what-happens-at-assessment-centre) pages on the official recruitment site.' +
      roleNote
    );
  }

  function buildGeneralEligibilityMessage() {
    const roleFinder =
      agentConfig?.productAdvisory?.knowledgeAndRecommendations?.roleFinderUrl ||
      'https://jobs.army.mod.uk/regular-army/find-a-role/';

    return (
      'Eligibility to join the **British Army** depends on meeting national entry standards plus any extra requirements for the role you choose. Typical criteria include:\n\n' +
      '**Age**\n' +
      '- You can usually apply from **16** (with parental consent if under 18) up to around **35**, depending on the role and entry type.\n\n' +
      '**Nationality and residency**\n' +
      '- You must meet British Army nationality and residency rules (confirm the latest policy on the official recruitment site).\n\n' +
      '**Qualifications**\n' +
      '- Many soldier roles accept **GCSEs** (often including Maths and English) or equivalent; some trades require higher qualifications.\n\n' +
      '**Health and fitness**\n' +
      '- You must pass medical checks and fitness assessments, including tests at the **Army Assessment Centre**.\n\n' +
      '**Security**\n' +
      '- Background and security checks apply; some roles require enhanced vetting.\n\n' +
      '**Role-specific requirements**\n' +
      '- Each trade has its own entry criteria on its official role page.\n\n' +
      'For the latest guidance, see [How to join](https://apply.army.mod.uk/how-to-join) and ' +
      `[Find a role](${roleFinder}). ` +
      'Tell me which role interests you and I can outline its specific entry requirements.'
    );
  }

  function buildEligibilityMessage(role) {
    const name = role.productName;
    const entry = typicalEntryLine(role);
    return (
      `Entry requirements for **${mdLink(name, role.productPageURL)}** are set on the official role page. Typical expectations include:\n\n` +
      `- **Age:** usually 16–35 at application (confirm on the role page).\n` +
      `- **Qualifications:** ${entry}.\n` +
      `- **Fitness and health:** you must pass medical and fitness assessments at the Army Assessment Centre.\n` +
      (role.productDescription ? `- **Role focus:** ${role.productDescription}\n` : '') +
      `\nAlways confirm the latest requirements on ${mdLink('the official role page', role.productPageURL)} before you apply.`
    );
  }

  function buildTrainingMessage(role) {
    const name = role.productName;
    return (
      `Training for **${mdLink(name, role.productPageURL)}** follows the standard Army pathway:\n\n` +
      '1. **Basic training** — core military skills, fitness, and teamwork.\n' +
      `2. **Specialist trade training** — technical and professional skills for ${name}.\n` +
      '3. **Ongoing development** — qualifications and progression opportunities throughout your career.\n\n' +
      `Full training details are on ${mdLink('the official role page', role.productPageURL)}. Would you like to know how to apply for this role?`
    );
  }

  function buildProgressionMessage(text) {
    if (/engineer/.test(norm(text))) {
      return (
        'Within British Army engineering roles, such as those in the Royal Engineers, there are strong career progression opportunities that combine technical expertise with leadership development.\n\n' +
        '**Overview:**\n\n' +
        '1. **Junior to senior tradesperson** — Start in a trade role and progress to supervise complex projects.\n' +
        '2. **Non-commissioned officer (NCO) ranks** — Promotion to Corporal, Sergeant and beyond with team leadership.\n' +
        '3. **Specialist qualifications** — Advanced engineering skills and civilian-recognised certifications.\n' +
        '4. **Commissioned officer pathway** — Experienced soldiers can apply for officer training.\n' +
        '5. **Senior leadership** — Progression to senior NCO or officer roles with strategic responsibility.\n\n' +
        'For official pathways, see the [Royal Engineers role pages](https://jobs.army.mod.uk/roles/royal-engineers/) and individual trade listings on [Find a role](https://jobs.army.mod.uk/regular-army/find-a-role/).\n\n' +
        'Would you like information on specific training courses or how to start your application?'
      );
    }
    return (
      'Career progression in the British Army typically moves from initial trade training through specialist qualifications, promotion to non-commissioned officer ranks, and optionally commissioning as an officer. Progression depends on your trade, performance, and qualifications.\n\n' +
      'Browse official role pages for trade-specific pathways, or tell me which role family interests you (cyber, engineering, combat, logistics).'
    );
  }

  function buildRoleListMessage(text, roles, options) {
    const opts = options || {};
    const intro = buildRecommendIntro(text, roles, opts);

    const blocks = roles.map(function (p, i) {
      const title = formatRoleListTitle(p, i, opts);
      const bullets = roleDetailBullets(p, opts)
        .map(function (b) {
          return '- ' + b;
        })
        .join('\n');
      return title + '\n\n' + bullets + '\n\n' + mdLink('Learn more / Apply', p.productPageURL);
    });

    const closing = opts.teamBasedActive
      ? 'Would you like details on training or career progression for any of these roles?'
      : 'If you want, I can provide details on training or entry requirements for any of these roles.';

    return intro + '\n\n' + blocks.join('\n\n') + '\n\n' + closing;
  }

  function roleListFiltersFromText(text) {
    const t = norm(text);
    const filters = {};
    if (/royal signals/.test(t)) {
      filters.corps = 'royal-signals';
      filters.corpsLabel = 'Royal Signals';
    }
    if (/it\b|networks?|cyber/.test(t)) filters.itCyberOnly = true;
    return filters;
  }

  const GENERAL_SUGGESTIONS = [
    'What are the eligibility criteria for joining the British Army?',
    'How do I apply for the Combat Cyber Operator role?',
    'What fitness tests are included at the Army Assessment Centre?',
    'What career progression opportunities exist in Army engineering roles?',
    'Show me British Army roles in cyber and IT',
    'Tell me about Army life and benefits',
    'What training is provided for new recruits?',
    'How can I prepare for the Army Assessment Centre?',
    'Browse roles on the official Army role finder',
    'What are entry requirements for the Vehicle Mechanic role?',
  ];

  function buildSuggestions(text, roles, intentKind) {
    const intent = intentKind || intentFromText(text).kind;
    const primary = roles[0];

    if (intent === 'apply' && primary) {
      return pickUniqueSuggestions(
        [
          `What fitness tests are included for the ${primary.productName} role?`,
          `How can I prepare for aptitude tests for ${primary.productName}?`,
          `What does specialist training involve after basic training for ${primary.productName}?`,
          `What are the entry requirements for ${primary.productName}?`,
          'What fitness tests are included at the Army Assessment Centre?',
        ],
        3
      );
    }

    if (intent === 'fitness') {
      return pickUniqueSuggestions(
        [
          'What are the minimum standards for the Individual Physical Fitness Test?',
          'Are there specific fitness tests for different Army roles?',
          'How can I best prepare for the Multi-Stage Fitness Test?',
          primary
            ? `How do I apply for the ${primary.productName} role?`
            : 'How do I apply for the Combat Cyber Operator role?',
          'What happens at the Army Assessment Centre besides fitness tests?',
        ],
        3
      );
    }

    if (intent === 'generalEligibility') {
      return pickUniqueSuggestions(
        [
          'How do I apply for the Combat Cyber Operator role?',
          'What fitness tests are included at the Army Assessment Centre?',
          'I am 18 and have GCSEs. Please recommend 2 to 3 active, team-based roles',
          'Show me British Army roles in cyber and IT',
          'Browse roles on the official Army role finder',
        ],
        3
      );
    }

    if (intent === 'eligibility' && primary) {
      return pickUniqueSuggestions(
        [
          `How do I apply for the ${primary.productName} role?`,
          `What training is provided for ${primary.productName}?`,
          'What fitness tests are included at the Army Assessment Centre?',
          'Show me similar roles I might qualify for',
        ],
        3
      );
    }

    if (intent === 'training' && primary) {
      return pickUniqueSuggestions(
        [
          `How do I apply for the ${primary.productName} role?`,
          `What are the entry requirements for ${primary.productName}?`,
          'What fitness tests are included at the Army Assessment Centre?',
          'What other roles are there in this career area?',
        ],
        3
      );
    }

    if (intent === 'about') {
      return pickUniqueSuggestions(
        [
          'What are the eligibility criteria for joining the British Army?',
          'How can training prepare recruits for overseas operational duties?',
          'What career progression opportunities exist within Army engineering roles?',
          'Show me cyber roles in the British Army',
          'What fitness tests are included at the Army Assessment Centre?',
        ],
        3
      );
    }

    if (intent === 'events') {
      return pickUniqueSuggestions(
        [
          'Show me British Army roles in cyber and IT',
          'How do I apply for the Combat Cyber Operator role?',
          'What fitness tests are included at the Army Assessment Centre?',
          'Tell me about engineering roles in the Army',
          'Browse roles on the official Army role finder',
        ],
        3
      );
    }

    if (intent === 'progression') {
      return pickUniqueSuggestions(
        [
          'What specific training courses are available for Royal Engineers?',
          'How can I apply for officer training in the Royal Engineers?',
          'What civilian qualifications can be earned through Army engineering roles?',
          'How do I apply for a Vehicle Mechanic role?',
        ],
        3
      );
    }

    if (intent === 'life') {
      return pickUniqueSuggestions(
        [
          'What are the eligibility criteria for joining the British Army?',
          'Show me roles that match GCSE qualifications',
          'What fitness tests are included at the Army Assessment Centre?',
          'Tell me about cyber roles in the Army',
        ],
        3
      );
    }

    if (intent === 'teamRecommend' && roles.length) {
      return pickUniqueSuggestions(
        [
          'What training is involved for an Infantry Soldier in the British Army?',
          'How does career progression work for a Royal Engineer in the Army?',
          'What qualifications are needed to become a Royal Signals Network Engineer?',
          'What fitness tests are included at the Army Assessment Centre?',
          'How do I apply for the Infantry Soldier role?',
        ],
        3
      );
    }

    if ((intent === 'recommend' || intent === 'general') && roles.length) {
      const names = roles.map(function (p) {
        return displayRoleName(p);
      });
      return pickUniqueSuggestions(
        [
          `What are the entry requirements for the ${names[0]} role?`,
          names[1] ? `How do I apply for the ${names[1]} role?` : 'How do I apply for a Royal Signals role?',
          names[2] ? `What training is provided for ${names[2]}?` : 'What training is provided for cyber roles?',
          'What fitness tests are included at the Army Assessment Centre?',
          'Show me other Royal Signals roles in IT and cyber',
        ],
        3
      );
    }

    const roleBased = [];
    if (roles[0]) {
      roleBased.push(`What are the entry requirements for the ${roles[0].productName} role?`);
    }
    if (roles[1]) {
      roleBased.push(`What training is provided for the ${roles[1].productName} position?`);
    }
    if (roles[2]) {
      roleBased.push(`How do I apply for the ${roles[2].productName} role?`);
    }

    return pickUniqueSuggestions(roleBased.concat(GENERAL_SUGGESTIONS), 3);
  }

  function multimodalElements(roles) {
    const withImages = roles.filter((p) => p.productImageURL);
    const cards = (withImages.length ? withImages : roles).slice(0, 3);
    return {
      elements: cards.map((p) => ({
        entity_info: {
          productID: p.productID,
          productName: p.productName,
          productDescription: p.productDescription || p.productName,
          productPageURL: p.productPageURL,
          productImageURL: p.productImageURL || '',
        },
      })),
    };
  }

  function idsFromPayload(payload) {
    const conv = payload?.xdm?.conversation || payload?.data?.conversation || {};
    const conversationId =
      conv.conversationID || conv.conversationId || 'local-conv-' + Date.now();
    const interactionId = conv.turnID || conv.turnId || conv.interactionId || 'local-turn-' + Date.now();
    return { conversationId, interactionId };
  }

  async function buildTurn(payload) {
    await loadData();
    const text = extractUserMessage(payload) || 'Tell me about Army roles';
    const intent = intentFromText(text);
    let message;
    let roles = [];
    let suggestionIntent = intent.kind;

    if (intent.kind === 'about') {
      message = buildAboutArmyMessage();
    } else if (intent.kind === 'life') {
      message = buildArmyLifeMessage();
    } else if (intent.kind === 'events') {
      message = buildEventsMessage();
    } else if (intent.kind === 'fitness') {
      message = buildFitnessMessage(text);
      const hinted = findRoleInText(text);
      if (hinted) roles = [hinted];
    } else if (intent.kind === 'apply') {
      const role = findRoleInText(text);
      if (role) {
        message = buildApplyMessage(role);
        roles = [role];
      } else {
        message =
          'To apply for a British Army role, choose a role on the official site, check eligibility, then complete the online application. Tell me which role you are interested in (for example Combat Cyber Operator or Vehicle Mechanic) and I can give step-by-step guidance.\n\n' +
          `[Browse all roles](${agentConfig?.productAdvisory?.knowledgeAndRecommendations?.roleFinderUrl || 'https://jobs.army.mod.uk/regular-army/find-a-role/'})`;
      }
    } else if (intent.kind === 'eligibility') {
      if (isGeneralArmyEligibilityQuestion(text)) {
        message = buildGeneralEligibilityMessage();
        suggestionIntent = 'generalEligibility';
      } else {
        const role = findExplicitRoleInText(text);
        if (role) {
          message = buildEligibilityMessage(role);
          roles = [role];
        } else {
          message = buildGeneralEligibilityMessage();
          suggestionIntent = 'generalEligibility';
        }
      }
    } else if (intent.kind === 'training') {
      const role = findRoleInText(text);
      if (role) {
        message = buildTrainingMessage(role);
        roles = [role];
      } else {
        roles = pickRoles(text, 3);
        message = roles.length
          ? buildRoleListMessage(text, roles)
          : 'Tell me which role you are interested in for training pathway details.';
        suggestionIntent = 'general';
      }
    } else if (intent.kind === 'progression') {
      message = buildProgressionMessage(text);
      roles = pickRoles('engineering', 2);
    } else {
      const listFilters = roleListFiltersFromText(text);
      const roleLimit = parseRequestedCount(text);
      const teamBasedActive = wantsTeamBasedActiveRecommend(text);

      if (teamBasedActive) {
        roles = pickTeamBasedActiveRoles(roleLimit);
        listFilters.teamBasedActive = true;
        suggestionIntent = 'teamRecommend';
      } else {
        roles = pickRoles(text, roleLimit, listFilters);
      }

      if (roles.length) {
        message = buildRoleListMessage(text, roles, listFilters);
      } else {
        message =
          'I can help you explore British Army roles using our official role catalog. Tell me your age, qualifications (for example GCSEs), and interests (cyber, engineering, combat, logistics) and I will suggest suitable roles with official links.\n\n' +
          `[Browse all roles](${agentConfig?.productAdvisory?.knowledgeAndRecommendations?.roleFinderUrl || 'https://jobs.army.mod.uk/regular-army/find-a-role/'})`;
      }
    }

    const promptSuggestions = buildSuggestions(text, roles, suggestionIntent);
    const { conversationId, interactionId } = idsFromPayload(payload);

    return {
      conversationId,
      interactionId,
      request: { message: text, context: { application: 'local-fallback' } },
      response: {
        message,
        sources: [],
        promptSuggestions,
        multimodalElements: roles.length ? multimodalElements(roles) : { elements: [] },
        widgets: [],
      },
      state: 'completed',
    };
  }

  function isChatFailure(result) {
    if (!result) return true;
    if (result?.error?.message) return true;
    if (result?.response?.state === 'error') return true;
    if (Array.isArray(result?.handle)?.[0]?.payload?.[0]?.state === 'error') return true;
    return false;
  }

  function roleUrlByProductName(name) {
    if (!name) return '';
    const n = norm(name);
    const hit = catalog.find((p) => norm(p.productName) === n);
    return hit?.productPageURL || '';
  }

  /** Full-size link overlay so image + title open the official role page. */
  function wireMultimodalCardLinks(root) {
    const scope = root || document;
    scope.querySelectorAll('.bc-multimodal-card').forEach(function (card) {
      if (card.querySelector('a.army-bc-card-link')) return;
      const label =
        card.querySelector('.bc-multimodal-card__text label')?.textContent?.trim() ||
        card.getAttribute('aria-label')?.replace(/^View\s+/i, '').trim();
      const url = roleUrlByProductName(label);
      if (!url) return;

      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'army-bc-card-link';
      a.setAttribute('aria-label', `Open ${label} on Army Jobs`);
      card.style.position = card.style.position || 'relative';
      card.appendChild(a);
    });
  }

  /**
   * Deliver the full formatted turn once (BC renders markdown correctly).
   * Brief pause keeps the loading state visible; CSS handles a quick fade-in.
   */
  function streamTurnToCallback(turn, streamCb, options) {
    if (typeof streamCb !== 'function') return Promise.resolve(turn);

    const opts = options || {};
    const revealDelayMs =
      opts.revealDelayMs ??
      (typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        ? 0
        : 220);

    function emitCompleted() {
      streamCb({
        conversationId: turn.conversationId,
        interactionId: turn.interactionId,
        request: turn.request,
        state: 'completed',
        response: {
          message: turn.response?.message || '',
          sources: turn.response?.sources || [],
          promptSuggestions: turn.response?.promptSuggestions || [],
          multimodalElements: turn.response?.multimodalElements || { elements: [] },
          widgets: turn.response?.widgets || [],
        },
      });
      requestAnimationFrame(function () {
        wireMultimodalCardLinks();
      });
    }

    return new Promise(function (resolve) {
      setTimeout(function () {
        emitCompleted();
        resolve(turn);
      }, revealDelayMs);
    });
  }

  function observeMultimodalCards() {
    if (global.__armyBcCardLinkObs) return;
    const obs = new MutationObserver(function () {
      wireMultimodalCardLinks();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    global.__armyBcCardLinkObs = obs;
  }

  global.ArmyBcLocalEngine = {
    loadData,
    buildTurn,
    streamTurnToCallback,
    wireMultimodalCardLinks,
    observeMultimodalCards,
    isChatFailure,
    extractUserMessage,
    topicFromText,
    intentFromText,
    findRoleInText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
