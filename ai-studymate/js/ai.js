/**
 * ai-studymate/js/ai.js
 * AI Integration Layer
 *
 * Supports two modes:
 *   DEMO MODE  — No API key required. Returns rich, realistic sample content
 *                so the app is fully demonstrable for a submission/presentation.
 *   LIVE MODE  — Requires a Groq API key stored in localStorage.
 *                The key is never sent anywhere except api.groq.com.
 *
 * To enable Live Mode:
 *   Open ⚙ Settings → paste your Groq API key (gsk_...) → Save.
 *   Get a free key at: https://console.groq.com/keys
 *
 * No API keys are hardcoded here. Demo mode is the safe default.
 */

const AI_CONFIG = {
  endpoint:  'https://api.groq.com/openai/v1/chat/completions',
  model:     'llama-3.3-70b-versatile',
  maxTokens: 1024,
};

/* ================================================================
   Core query — routes to demo or live depending on key presence
   ================================================================ */

/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<{text:string, isDemo:boolean, error?:boolean, errorCode?:string}>}
 */
async function aiQuery(systemPrompt, userPrompt) {
  const key = getApiKey();
  if (!key) {
    // No key — return demo immediately, no network request
    return { text: _demoResponse(systemPrompt, userPrompt), isDemo: true };
  }

  try {
    const res = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:      AI_CONFIG.model,
        max_tokens: AI_CONFIG.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt  },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg     = errBody?.error?.message || `HTTP ${res.status}`;
      const code    = errBody?.error?.code    || String(res.status);
      throw Object.assign(new Error(msg), { code });
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('Empty response from API.');
    return { text, isDemo: false };

  } catch (err) {
    const friendly = _friendlyError(err);
    return {
      text:      friendly.message,
      isDemo:    false,
      error:     true,
      errorCode: friendly.code,
      fallback:  friendly.useFallback,
    };
  }
}

/** Map raw Groq API errors to user-readable messages + fallback hints */
function _friendlyError(err) {
  const msg  = err.message || '';
  const code = err.code    || '';

  // Groq invalid key: HTTP 401 or error code "invalid_api_key"
  if (code === 'invalid_api_key' || msg.includes('Invalid API Key') || msg.includes('401')) {
    return {
      code: 'invalid_key',
      useFallback: true,
      message: '🔑 Invalid Groq API key. Check that you copied the full key (starts with gsk_) from console.groq.com/keys and saved it in ⚙ Settings. Showing Demo Mode output below.',
    };
  }
  // Groq rate limit: HTTP 429
  if (code === 'rate_limit_exceeded' || msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit')) {
    return {
      code: 'rate_limit',
      useFallback: true,
      message: '⏱ Groq rate limit reached (free tier has per-minute token limits). Wait 10–30 seconds and try again. Demo Mode output is shown below in the meantime.',
    };
  }
  // Groq model not found / deprecated
  if (msg.includes('model') && (msg.includes('not found') || msg.includes('does not exist') || msg.includes('decommissioned'))) {
    return {
      code: 'model_not_found',
      useFallback: true,
      message: `🤖 The model "${AI_CONFIG.model}" was not found on Groq. It may have been renamed or removed. Check console.groq.com/docs/models for current model IDs. Showing Demo Mode output below.`,
    };
  }
  // Groq quota / billing (unlikely on free tier but possible on paid)
  if (msg.includes('quota') || msg.includes('billing') || msg.includes('insufficient')) {
    return {
      code: 'quota',
      useFallback: true,
      message: '💳 Groq API quota exceeded. Check your usage at console.groq.com. Showing Demo Mode output below.',
    };
  }
  // Network / CORS — common when serving from file://
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS') || msg.includes('Load failed')) {
    return {
      code: 'network',
      useFallback: true,
      message: '🌐 Could not reach api.groq.com. If you are opening the HTML file directly (file://), use a local server instead — see README.md for instructions. Showing Demo Mode output below.',
    };
  }
  // Generic fallback — show the raw message so it is not silently swallowed
  return {
    code: 'unknown',
    useFallback: false,
    message: `⚠️ Groq API request failed: ${msg}`,
  };
}

/* ================================================================
   Task-specific helpers
   ================================================================ */

async function aiSummarize(notes, style = 'concise') {
  const system = `You are a study assistant for university students.
Summarize the provided lecture notes in a clear, well-structured way.
Style: ${style}. Use bullet points and short paragraphs.
Highlight KEY TERMS in CAPS. End with a "Key Takeaways" section (3–5 bullet points).`;

  const result = await aiQuery(system, notes);

  // If live call failed with a fallback-worthy error, substitute demo
  if (result.error && result.fallback) {
    return { ..._makeDemoSummary(notes, style), errorMessage: result.text };
  }
  if (result.isDemo) {
    return _makeDemoSummary(notes, style);
  }
  return result;
}

async function aiExplain(concept, level = 'undergraduate') {
  const system = `You are a patient and knowledgeable tutor.
Explain the concept clearly for a ${level} student.
Use an analogy if helpful. Keep it under 250 words.
Structure: 1) Plain definition, 2) Why it matters, 3) Simple example.`;

  const result = await aiQuery(system, `Explain: ${concept}`);

  if (result.error && result.fallback) {
    return { ..._makeDemoExplanation(concept, level), errorMessage: result.text };
  }
  if (result.isDemo) {
    return _makeDemoExplanation(concept, level);
  }
  return result;
}

async function aiGenerateQuiz(topic, count = 5) {
  const system = `You are a university exam question writer.
Generate exactly ${count} multiple-choice questions about the given topic.
Return ONLY valid JSON — no prose, no markdown fences:
[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"answer":"A) ..."}]`;

  const result = await aiQuery(system, `Topic: ${topic}`);

  if (result.isDemo || (result.error && result.fallback)) {
    const demoRes = {
      text:    'Demo quiz generated.',
      isDemo:  true,
      parsed:  _makeDemoQuiz(topic, count),
    };
    if (result.errorMessage) demoRes.errorMessage = result.text;
    return demoRes;
  }

  // Parse JSON from live response
  try {
    const raw = result.text.replace(/```json|```/g, '').trim();
    result.parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON from API — fall back to demo questions silently
    result.parsed     = _makeDemoQuiz(topic, count);
    result.parseError = true;
  }
  return result;
}

async function aiStudyPlan(subject, daysAvailable, hoursPerDay) {
  const system = `You are a study planner for university students.
Given the subject, available days, and daily hours, create a structured weekly study plan.
Return ONLY a JSON object with day names as keys and arrays of task strings as values.
Example: {"Mon": ["Read Chapter 1 (1h)", "Practice problems (30m)"]}
Only include the provided days. Tasks must be specific and time-boxed.`;

  const prompt = `Subject: ${subject}\nAvailable days: ${daysAvailable.join(', ')}\nHours per day: ${hoursPerDay}`;
  const result = await aiQuery(system, prompt);

  if (result.isDemo || (result.error && result.fallback)) {
    return {
      text:    'Demo plan generated.',
      isDemo:  true,
      parsed:  _makeDemoPlan(subject, daysAvailable, hoursPerDay),
      ...(result.error ? { errorMessage: result.text } : {}),
    };
  }

  try {
    const raw = result.text.replace(/```json|```/g, '').trim();
    result.parsed = JSON.parse(raw);
  } catch {
    result.parsed     = _makeDemoPlan(subject, daysAvailable, hoursPerDay);
    result.parseError = true;
  }
  return result;
}

/* ================================================================
   Rich Demo Content Generators
   (topic-aware, realistic, clearly labelled as demo)
   ================================================================ */

/**
 * Summaries — detect common academic topics and return realistic output.
 * Falls back to a generic but still useful academic summary template.
 */
function _makeDemoSummary(notes, style) {
  const topic = _detectTopic(notes);
  const summaries = {
    biology: `📋 DEMO SUMMARY — Biology: Cellular Processes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overview
CELLULAR RESPIRATION is the process by which cells convert glucose into usable energy (ATP). It occurs in three main stages.

Stage 1 — GLYCOLYSIS (Cytoplasm)
• Glucose (6C) is split into two PYRUVATE molecules (3C each)
• Net gain: 2 ATP + 2 NADH
• Occurs in the cytoplasm; does not require oxygen

Stage 2 — KREBS CYCLE (Mitochondrial Matrix)
• Pyruvate is converted to ACETYL-CoA, entering the cycle
• Each cycle produces: 1 ATP, 3 NADH, 1 FADH₂, 2 CO₂
• Completes twice per glucose molecule

Stage 3 — ELECTRON TRANSPORT CHAIN (Inner Mitochondrial Membrane)
• NADH and FADH₂ donate electrons to protein complexes
• Creates a PROTON GRADIENT driving ATP SYNTHASE
• Produces ~32–34 ATP per glucose; requires O₂

Key Takeaways
• Glycolysis is anaerobic; Krebs Cycle and ETC require oxygen
• MITOCHONDRIA are the "powerhouses" — site of most ATP production
• Overall yield: ~36–38 ATP per glucose molecule
• CO₂ is a waste product released during the Krebs Cycle
• Without oxygen, cells switch to FERMENTATION (lactic acid or ethanol)

⚠️ DEMO MODE — This is a sample summary. Add an API key in ⚙ Settings to summarize your actual notes.`,

    chemistry: `📋 DEMO SUMMARY — Chemistry: Chemical Bonding
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overview
CHEMICAL BONDS form when atoms interact to achieve stable ELECTRON CONFIGURATIONS, typically a full outer shell (OCTET RULE).

Types of Bonds
• IONIC BONDS: Transfer of electrons between a metal and non-metal
  — Example: NaCl (Na⁺ and Cl⁻)
  — Properties: High melting point, conducts electricity when dissolved

• COVALENT BONDS: Sharing of electrons between non-metals
  — POLAR covalent: Unequal sharing (e.g., H₂O)
  — NONPOLAR covalent: Equal sharing (e.g., O₂)

• METALLIC BONDS: Delocalized "sea of electrons" in metals
  — Explains electrical conductivity and malleability

ELECTRONEGATIVITY determines bond polarity; large differences → ionic bonds.

Key Takeaways
• Bond type depends on the electronegativity difference between atoms
• Ionic compounds form crystal lattices; covalent compounds form molecules
• VSEPR theory predicts molecular geometry from electron pairs
• Polarity affects physical properties (solubility, boiling point)
• HYDROGEN BONDS are strong intermolecular forces in water

⚠️ DEMO MODE — This is a sample summary. Add an API key in ⚙ Settings to summarize your actual notes.`,

    history: `📋 DEMO SUMMARY — History: World War II
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overview
WORLD WAR II (1939–1945) was the deadliest conflict in human history, involving most of the world's nations in two opposing military alliances: the ALLIES and the AXIS POWERS.

Key Causes
• TREATY OF VERSAILLES (1919) — punitive terms fueled German resentment
• Rise of FASCISM in Germany (NAZISM under Hitler) and Italy
• APPEASEMENT policy by Britain and France failed to deter aggression
• Japan's expansionism in Asia created Pacific tensions

Major Phases
1. German Blitzkrieg (1939–1941): Rapid conquest of Europe
2. Operation Barbarossa (1941): Germany invades Soviet Union
3. Pacific Theater: Japan attacks Pearl Harbor (Dec 1941) → US enters war
4. Allied Counteroffensive (1942–1944): North Africa, Italy, D-Day
5. Defeat of Germany (May 1945) and Japan (Sept 1945)

Key Takeaways
• Holocaust: Systematic genocide of 6 million Jews and millions of others
• Atomic bombs on Hiroshima and Nagasaki ended the Pacific War
• ~70–85 million people died (civilians + military)
• Led to the founding of the UNITED NATIONS (1945)
• Marked the beginning of the Cold War rivalry between the US and USSR

⚠️ DEMO MODE — This is a sample summary. Add an API key in ⚙ Settings to summarize your actual notes.`,

    economics: `📋 DEMO SUMMARY — Economics: Supply and Demand
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overview
SUPPLY AND DEMAND is the fundamental model of price determination in a MARKET ECONOMY. It explains how prices and quantities are set through the interaction of buyers and sellers.

The Demand Curve
• Shows the inverse relationship between PRICE and QUANTITY DEMANDED
• Shifts right when: income rises, substitute prices rise, preferences increase
• Key concept: LAW OF DEMAND — as price ↑, quantity demanded ↓

The Supply Curve
• Shows the positive relationship between price and quantity supplied
• Shifts right when: input costs fall, technology improves, more producers enter
• Key concept: LAW OF SUPPLY — as price ↑, quantity supplied ↑

MARKET EQUILIBRIUM
• Where supply curve meets demand curve
• EQUILIBRIUM PRICE: no shortage or surplus exists
• PRICE CEILING (below equilibrium) → shortage
• PRICE FLOOR (above equilibrium) → surplus

Key Takeaways
• Markets self-correct toward equilibrium (INVISIBLE HAND — Adam Smith)
• ELASTICITY measures how sensitive quantity is to price changes
• Government interventions (taxes, subsidies, price controls) shift curves
• CONSUMER SURPLUS and PRODUCER SURPLUS measure market welfare
• External shocks (COVID, wars) shift both curves simultaneously

⚠️ DEMO MODE — This is a sample summary. Add an API key in ⚙ Settings to summarize your actual notes.`,

    math: `📋 DEMO SUMMARY — Mathematics: Calculus — Derivatives
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overview
A DERIVATIVE measures the instantaneous RATE OF CHANGE of a function. It is the foundational concept of DIFFERENTIAL CALCULUS.

Definition
• f'(x) = lim(h→0) [f(x+h) − f(x)] / h
• Geometrically: the slope of the TANGENT LINE at point x

Core Differentiation Rules
• Power Rule:     d/dx [xⁿ] = nxⁿ⁻¹
• Product Rule:   d/dx [uv] = u'v + uv'
• Quotient Rule:  d/dx [u/v] = (u'v − uv') / v²
• Chain Rule:     d/dx [f(g(x))] = f'(g(x)) · g'(x)

Common Derivatives
• d/dx [sin x] = cos x
• d/dx [eˣ] = eˣ
• d/dx [ln x] = 1/x

Applications
• Finding MAXIMA and MINIMA (set f'(x) = 0)
• OPTIMIZATION problems in physics, economics, engineering
• RELATED RATES problems (e.g., filling tanks, moving shadows)

Key Takeaways
• Derivatives describe how quickly quantities change
• f'(x) > 0 → function increasing; f'(x) < 0 → decreasing
• f''(x) reveals concavity and INFLECTION POINTS
• The FUNDAMENTAL THEOREM of Calculus links derivatives and integrals
• Mastering the chain rule is essential for composite function problems

⚠️ DEMO MODE — This is a sample summary. Add an API key in ⚙ Settings to summarize your actual notes.`,

    cs: `📋 DEMO SUMMARY — Computer Science: Data Structures
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overview
DATA STRUCTURES are specialized formats for organizing, storing, and accessing data efficiently. The choice of data structure directly impacts ALGORITHM PERFORMANCE.

Core Structures
• ARRAY: Fixed-size, index-based. O(1) access, O(n) insertion/deletion.
• LINKED LIST: Dynamic size, node-pointer chain. O(n) access, O(1) insert at head.
• STACK (LIFO): Push/pop from top. Used in function call stacks, undo operations.
• QUEUE (FIFO): Enqueue/dequeue. Used in scheduling, BFS traversal.
• HASH TABLE: Key→value mapping. O(1) average lookup using HASH FUNCTION.
• BINARY SEARCH TREE: Sorted hierarchy. O(log n) search when balanced.
• HEAP: Complete binary tree. Min-heap or max-heap; O(log n) insert/extract.
• GRAPH: Nodes + edges. Directed/undirected. Used in networks, maps.

Choosing a Structure
• Frequent lookup? → Hash Table
• Ordered data with range queries? → BST or sorted array
• Priority processing? → Heap / Priority Queue
• Hierarchical data? → Tree

Key Takeaways
• BIG-O NOTATION describes worst-case time/space complexity
• Arrays are cache-friendly; linked lists are flexible
• Balanced trees (AVL, Red-Black) maintain O(log n) guarantees
• Graphs model real-world relationships (social networks, routing)
• Understanding trade-offs is more important than memorizing implementations

⚠️ DEMO MODE — This is a sample summary. Add an API key in ⚙ Settings to summarize your actual notes.`,
  };

  const text = summaries[topic] || _genericDemoSummary(notes);
  return { text, isDemo: true };
}

function _genericDemoSummary(notes) {
  const wordCount  = notes.trim().split(/\s+/).length;
  const firstLine  = notes.trim().split('\n')[0].slice(0, 60);
  return `📋 DEMO SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Input detected: ${wordCount} words
Opening content: "${firstLine}…"

MAIN CONCEPTS (detected from your notes)
• Core principle #1 — The foundational idea of this subject
• Core principle #2 — Secondary mechanism or supporting theory
• Core principle #3 — Application or real-world connection

KEY DEFINITIONS
• TERM A: The primary concept; directly linked to outcomes
• TERM B: Supporting mechanism that enables TERM A
• TERM C: Measurement or evaluation method used in this field

IMPORTANT RELATIONSHIPS
• When X increases, Y tends to decrease (inverse relationship)
• Z is a prerequisite for understanding all subsequent concepts
• The interplay between A and B determines overall outcomes

COMMON EXAM QUESTIONS
• Explain the difference between Term A and Term B
• Describe the 3-step process and its significance
• Calculate or apply the main formula/principle

Key Takeaways
• Understanding the core mechanism is more important than memorizing facts
• Connect each concept back to real-world examples for deeper retention
• Revisit the definitions of key terms before your exam
• Practice applying the main principle to novel scenarios
• Group related concepts into themes for easier recall

⚠️ DEMO MODE — This is a sample summary based on your input. Add an API key in ⚙ Settings for a real AI summary of your actual notes.`;
}

/**
 * Explanations — concept-aware demo output.
 */
function _makeDemoExplanation(concept, level) {
  const c     = concept.toLowerCase();
  const demos = {
    'photosynthesis': `💡 DEMO EXPLANATION — Photosynthesis [${level}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Plain Definition
Photosynthesis is the process by which plants, algae, and some bacteria convert light energy, water, and carbon dioxide into glucose (sugar) and oxygen. The overall equation is:
  6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂

2. Why It Matters
Photosynthesis is the foundation of nearly all food chains on Earth. Without it, plants couldn't produce the energy that herbivores eat, and the atmospheric oxygen we breathe wouldn't be replenished. It also drives the carbon cycle.

3. Simple Example / Analogy
Think of a plant leaf as a solar panel. Just as a solar panel converts sunlight into electrical energy your home can use, a leaf converts sunlight into chemical energy (glucose) the plant can use to grow, reproduce, and repair itself.

Key stages: Light-dependent reactions (in the thylakoid) capture energy; the Calvin Cycle (in the stroma) uses that energy to build sugar.`,

    'supply and demand': `💡 DEMO EXPLANATION — Supply & Demand [${level}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Plain Definition
Supply and demand is an economic model describing how the price and quantity of a good are determined. Demand is how much buyers want at each price; supply is how much sellers offer. Where they meet is the equilibrium price.

2. Why It Matters
This model explains everyday price changes — why concert tickets spike before a show, why petrol costs more in summer, and why housing prices rise when more people move to a city. It is the starting point for almost all microeconomics.

3. Simple Example / Analogy
Imagine a coffee cart on campus. If a cold snap hits, everyone suddenly wants hot coffee (demand rises). If the cart can't make more coffee faster (supply is fixed short-term), the vendor can charge more. Prices rise until some people decide it's too expensive — that's equilibrium finding itself.`,

    'recursion': `💡 DEMO EXPLANATION — Recursion [${level}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Plain Definition
Recursion is a programming technique where a function calls itself to solve a smaller version of the same problem. Every recursive function needs: (a) a base case that stops the recursion, and (b) a recursive case that breaks the problem down.

2. Why It Matters
Recursion elegantly solves problems that have a naturally self-similar structure — like traversing a file system, parsing nested JSON, or implementing quicksort. Many algorithms that would require complex loops are dramatically simpler when written recursively.

3. Simple Example / Analogy
Think of Russian nesting dolls (Matryoshka). To find the smallest doll, you open each doll and look inside — if there's another doll, repeat the process; if there isn't, you've found the base case. In code:

  function findSmallest(doll) {
    if (doll.isEmpty()) return doll;   // base case
    return findSmallest(doll.inside); // recursive case
  }`,

    'machine learning': `💡 DEMO EXPLANATION — Machine Learning [${level}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Plain Definition
Machine Learning (ML) is a branch of AI where systems learn patterns from data to make predictions or decisions — without being explicitly programmed with rules. The model improves as it sees more examples.

2. Why It Matters
ML powers spam filters, Netflix recommendations, medical diagnosis tools, fraud detection, and language models like ChatGPT. It lets computers tackle problems too complex to hand-code rules for.

3. Simple Example / Analogy
Teaching a dog is a good analogy. You don't explain the rules of "sit" mathematically — you reward correct behavior until the dog learns the pattern. Similarly, ML models are trained on labeled examples (input → correct output) until they learn to generalize to new data. The "reward signal" is minimizing prediction error.`,

    "newton's 3rd law": `💡 DEMO EXPLANATION — Newton's 3rd Law [${level}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Plain Definition
Newton's Third Law states: "For every action, there is an equal and opposite reaction." When object A exerts a force on object B, object B simultaneously exerts a force equal in magnitude and opposite in direction on object A.

2. Why It Matters
This law explains how rockets work in the vacuum of space, why recoil happens when you fire a gun, and how birds generate lift. It is fundamental to understanding all force interactions in classical mechanics.

3. Simple Example / Analogy
When you jump off a small boat onto a dock, you push backward on the boat — and the boat pushes forward on you (that's what launches you forward). The forces are equal, but because you and the boat have different masses, you move much less than the boat. Force = mass × acceleration (Newton's 2nd Law ties in here).`,

    'inflation': `💡 DEMO EXPLANATION — Inflation [${level}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Plain Definition
Inflation is the rate at which the general price level of goods and services rises over time, eroding the purchasing power of money. It is measured by indices like the Consumer Price Index (CPI).

2. Why It Matters
Inflation affects everyone — it determines real wages, interest rates, investment decisions, and government policy. Central banks like the Federal Reserve target ~2% annual inflation to balance growth and stability.

3. Simple Example / Analogy
If a coffee costs $3 today and inflation is 5% per year, it will cost $3.15 next year. Your $3 bill "bought less." This is why savings in a mattress lose real value over time, and why investments need to outpace inflation to build actual wealth.`,

    'dna replication': `💡 DEMO EXPLANATION — DNA Replication [${level}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Plain Definition
DNA replication is the biological process by which a cell copies its DNA before dividing. Each strand of the double helix serves as a template for a new complementary strand, resulting in two identical DNA molecules.

2. Why It Matters
Accurate DNA replication is essential for cell division — without it, daughter cells would lack the genetic instructions to survive. Errors in replication cause mutations, which can lead to cancer or genetic disorders.

3. Simple Example / Analogy
Imagine unzipping a jacket and using each half as a pattern to sew a new matching half. The enzyme helicase "unzips" the double helix; DNA polymerase then reads each strand and adds complementary nucleotides (A-T, G-C). The result: two identical double helices — one for each new cell.`,
  };

  // Try to match concept to demos
  for (const key of Object.keys(demos)) {
    if (c.includes(key)) return { text: demos[key], isDemo: true };
  }

  // Generic fallback explanation
  return {
    isDemo: true,
    text: `💡 DEMO EXPLANATION — ${concept} [${level}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Plain Definition
"${concept}" refers to a core concept in its field. At the ${level} level, it describes the fundamental principles governing how [subject matter] behaves or is understood. It provides the theoretical basis for more advanced topics in the discipline.

2. Why It Matters
Understanding "${concept}" is important because it underpins many practical applications. Professionals in related fields rely on this concept daily when analyzing data, designing systems, or making decisions. It often appears in exams as both a definition question and an applied scenario.

3. Simple Example / Analogy
Think of "${concept}" like a recipe in cooking. The recipe (the concept) defines the ingredients (variables) and the method (process). Just as following the recipe produces a predictable dish, applying "${concept}" to a problem produces a predictable, analyzable result.

Typical exam angles:
• Define the term and state its significance
• Compare it with a related but distinct concept
• Apply it to a given real-world scenario

⚠️ DEMO MODE — Add an API key in ⚙ Settings for a real explanation of "${concept}" tailored to your course level.`,
  };
}

/**
 * Quiz — generates topic-aware, answerable multiple-choice questions.
 */
function _makeDemoQuiz(topic, count) {
  const t   = topic.toLowerCase();
  const all = _demoQuizBank(t);
  // Fill to requested count using cycling if bank is smaller
  const result = [];
  for (let i = 0; i < Math.min(count, 10); i++) {
    result.push(all[i % all.length]);
  }
  return result;
}

function _demoQuizBank(topic) {
  const banks = {
    biology: [
      { question: 'Which organelle is known as the "powerhouse of the cell"?',
        options: ['A) Nucleus', 'B) Mitochondria', 'C) Ribosome', 'D) Golgi apparatus'],
        answer: 'B) Mitochondria' },
      { question: 'What is the primary product of photosynthesis?',
        options: ['A) Oxygen', 'B) Carbon dioxide', 'C) Glucose', 'D) Water'],
        answer: 'C) Glucose' },
      { question: 'Which phase of mitosis involves the alignment of chromosomes at the cell\'s equator?',
        options: ['A) Prophase', 'B) Anaphase', 'C) Metaphase', 'D) Telophase'],
        answer: 'C) Metaphase' },
      { question: 'DNA is made up of which type of monomers?',
        options: ['A) Amino acids', 'B) Fatty acids', 'C) Nucleotides', 'D) Monosaccharides'],
        answer: 'C) Nucleotides' },
      { question: 'Which blood type is considered the universal donor?',
        options: ['A) AB+', 'B) O−', 'C) A+', 'D) B−'],
        answer: 'B) O−' },
    ],
    chemistry: [
      { question: 'What is the atomic number of Carbon?',
        options: ['A) 6', 'B) 8', 'C) 12', 'D) 14'],
        answer: 'A) 6' },
      { question: 'Which type of bond involves the transfer of electrons?',
        options: ['A) Covalent', 'B) Hydrogen', 'C) Ionic', 'D) Metallic'],
        answer: 'C) Ionic' },
      { question: 'What does the pH scale measure?',
        options: ['A) Temperature', 'B) Acidity or alkalinity', 'C) Electrical charge', 'D) Atomic mass'],
        answer: 'B) Acidity or alkalinity' },
      { question: 'Which gas makes up approximately 78% of Earth\'s atmosphere?',
        options: ['A) Oxygen', 'B) Carbon dioxide', 'C) Argon', 'D) Nitrogen'],
        answer: 'D) Nitrogen' },
      { question: 'In a chemical equation, what does a catalyst do?',
        options: ['A) Increases activation energy', 'B) Is consumed in the reaction', 'C) Speeds up the reaction without being consumed', 'D) Decreases the yield'],
        answer: 'C) Speeds up the reaction without being consumed' },
    ],
    history: [
      { question: 'In which year did World War II end?',
        options: ['A) 1943', 'B) 1944', 'C) 1945', 'D) 1946'],
        answer: 'C) 1945' },
      { question: 'Who was the leader of Nazi Germany during World War II?',
        options: ['A) Mussolini', 'B) Stalin', 'C) Hitler', 'D) Franco'],
        answer: 'C) Hitler' },
      { question: 'The French Revolution began in which year?',
        options: ['A) 1776', 'B) 1789', 'C) 1804', 'D) 1815'],
        answer: 'B) 1789' },
      { question: 'Which treaty ended World War I?',
        options: ['A) Treaty of Paris', 'B) Treaty of Versailles', 'C) Treaty of Westphalia', 'D) Treaty of Utrecht'],
        answer: 'B) Treaty of Versailles' },
      { question: 'The Cold War was primarily a rivalry between which two nations?',
        options: ['A) USA and China', 'B) UK and France', 'C) USA and USSR', 'D) Germany and Japan'],
        answer: 'C) USA and USSR' },
    ],
    economics: [
      { question: 'What happens to quantity demanded when price increases, assuming all else equal?',
        options: ['A) It increases', 'B) It decreases', 'C) It stays the same', 'D) It doubles'],
        answer: 'B) It decreases' },
      { question: 'GDP stands for:',
        options: ['A) General Domestic Product', 'B) Gross Domestic Product', 'C) Growth and Development Policy', 'D) Global Demand Price'],
        answer: 'B) Gross Domestic Product' },
      { question: 'Which of the following is an example of a price floor?',
        options: ['A) Rent control', 'B) Minimum wage', 'C) Fuel subsidies', 'D) Import quotas'],
        answer: 'B) Minimum wage' },
      { question: 'Inflation is best described as:',
        options: ['A) A rise in unemployment', 'B) A fall in interest rates', 'C) A general increase in price levels', 'D) An increase in real wages'],
        answer: 'C) A general increase in price levels' },
      { question: 'The law of diminishing returns states that:',
        options: ['A) Profits always increase with output', 'B) Adding more of one input, holding others fixed, eventually yields smaller increases in output', 'C) Costs decrease as output increases', 'D) Supply always equals demand'],
        answer: 'B) Adding more of one input, holding others fixed, eventually yields smaller increases in output' },
    ],
    math: [
      { question: 'What is the derivative of f(x) = x³?',
        options: ['A) x²', 'B) 3x', 'C) 3x²', 'D) x⁴/4'],
        answer: 'C) 3x²' },
      { question: 'What does it mean when f\'(x) = 0 at a point?',
        options: ['A) The function is undefined', 'B) There is a potential maximum, minimum, or inflection point', 'C) The function is linear', 'D) The second derivative is negative'],
        answer: 'B) There is a potential maximum, minimum, or inflection point' },
      { question: 'The integral of a velocity function gives:',
        options: ['A) Acceleration', 'B) Force', 'C) Position (displacement)', 'D) Power'],
        answer: 'C) Position (displacement)' },
      { question: 'Which rule is used to differentiate f(g(x))?',
        options: ['A) Product Rule', 'B) Power Rule', 'C) Quotient Rule', 'D) Chain Rule'],
        answer: 'D) Chain Rule' },
      { question: 'What is the value of e (Euler\'s number) to 2 decimal places?',
        options: ['A) 2.71', 'B) 3.14', 'C) 1.61', 'D) 1.41'],
        answer: 'A) 2.71' },
    ],
    cs: [
      { question: 'What is the time complexity of binary search on a sorted array?',
        options: ['A) O(n)', 'B) O(n²)', 'C) O(log n)', 'D) O(1)'],
        answer: 'C) O(log n)' },
      { question: 'Which data structure operates on a LIFO (Last In, First Out) principle?',
        options: ['A) Queue', 'B) Stack', 'C) Linked List', 'D) Heap'],
        answer: 'B) Stack' },
      { question: 'What does OOP stand for?',
        options: ['A) Open Output Protocol', 'B) Object-Oriented Programming', 'C) Optimal Operation Procedure', 'D) Ordered Object Processing'],
        answer: 'B) Object-Oriented Programming' },
      { question: 'In a relational database, what does SQL stand for?',
        options: ['A) Structured Query Language', 'B) System Query Logic', 'C) Sequential Queue Language', 'D) Simple Question Language'],
        answer: 'A) Structured Query Language' },
      { question: 'Which sorting algorithm has an average-case complexity of O(n log n)?',
        options: ['A) Bubble Sort', 'B) Insertion Sort', 'C) Merge Sort', 'D) Selection Sort'],
        answer: 'C) Merge Sort' },
    ],
    physics: [
      { question: 'What is Newton\'s Second Law of Motion?',
        options: ['A) F = mv', 'B) F = ma', 'C) E = mc²', 'D) p = mv'],
        answer: 'B) F = ma' },
      { question: 'What is the SI unit of electric current?',
        options: ['A) Volt', 'B) Watt', 'C) Ampere', 'D) Ohm'],
        answer: 'C) Ampere' },
      { question: 'Which type of wave does not require a medium to travel?',
        options: ['A) Sound wave', 'B) Water wave', 'C) Seismic wave', 'D) Electromagnetic wave'],
        answer: 'D) Electromagnetic wave' },
      { question: 'What is the acceleration due to gravity on Earth (approx.)?',
        options: ['A) 8.9 m/s²', 'B) 9.8 m/s²', 'C) 10.8 m/s²', 'D) 11.2 m/s²'],
        answer: 'B) 9.8 m/s²' },
      { question: 'The Law of Conservation of Energy states that:',
        options: ['A) Energy can be created from matter', 'B) Energy is always lost as heat', 'C) Energy cannot be created or destroyed, only transformed', 'D) Kinetic energy is always greater than potential energy'],
        answer: 'C) Energy cannot be created or destroyed, only transformed' },
    ],
  };

  // Detect topic category
  for (const key of Object.keys(banks)) {
    if (topic.includes(key)) return banks[key];
  }

  // Generic fallback — still answerable, clearly labelled demo
  return [
    { question: `[DEMO] Which of the following best defines "${topic}"?`,
      options: ['A) A foundational principle underlying the subject', 'B) An unrelated historical event', 'C) A measurement technique only', 'D) A deprecated theory'],
      answer: 'A) A foundational principle underlying the subject' },
    { question: `[DEMO] What is a key characteristic of "${topic}"?`,
      options: ['A) It applies only in laboratory settings', 'B) It has broad real-world applications', 'C) It was disproved in the 20th century', 'D) It only applies to linear systems'],
      answer: 'B) It has broad real-world applications' },
    { question: `[DEMO] A student studying "${topic}" should first understand:`,
      options: ['A) Advanced applications before basics', 'B) Core definitions and foundational concepts', 'C) Memorizing formulas without context', 'D) Only the historical development'],
      answer: 'B) Core definitions and foundational concepts' },
    { question: '[DEMO] Which study method is most effective for technical subjects?',
      options: ['A) Passive re-reading', 'B) Active recall and spaced repetition', 'C) Highlighting text only', 'D) Cramming the night before'],
      answer: 'B) Active recall and spaced repetition' },
    { question: '[DEMO] What does an exam question on this topic most commonly test?',
      options: ['A) Memorized definitions only', 'B) Application of concepts to new scenarios', 'C) Recall of unrelated background', 'D) Mathematical calculation only'],
      answer: 'B) Application of concepts to new scenarios' },
  ];
}

/**
 * Study Plan — realistic, time-boxed tasks per subject.
 */
function _makeDemoPlan(subject, days, hoursPerDay) {
  const plan       = {};
  const totalMins  = hoursPerDay * 60;
  const subjectLC  = subject.toLowerCase();

  const taskSets = {
    biology: [
      ['Review cell biology notes and diagrams', 'Flashcard drill: organelle functions', 'Watch mitosis animation (YouTube)'],
      ['Read chapter: Genetics & DNA', 'Practice Punnett square problems', 'Summarize in your own words'],
      ['Past paper: 3 essay questions', 'Review mark schemes', 'Identify weak areas'],
      ['Focus revision: Photosynthesis vs Respiration', 'Draw and label diagrams from memory', 'Quiz yourself on key equations'],
      ['Full mock exam (timed)', 'Mark and review mistakes', 'Rest and light review'],
    ],
    math: [
      ['Read textbook: core definitions + theorems', 'Work through 5 example problems', 'Note where you get stuck'],
      ['Problem set: 10 practice questions', 'Check solutions and identify errors', 'Re-do incorrect problems'],
      ['Past paper: Section A (multiple choice)', 'Review formula sheet', 'Timed drill: 15 questions in 20 min'],
      ['Focus: hardest question type from problem set', 'Redo 3 similar problems from scratch', 'Create a "mistake log"'],
      ['Full timed past paper', 'Self-mark with rubric', 'Review all errors thoroughly'],
    ],
    history: [
      ['Read primary source + chapter overview', 'Create a timeline of key events', 'Summarize in bullet points'],
      ['Analyze one essay question from past papers', 'Draft a structured response outline', 'Compare with model answer'],
      ['Revise key figures and their significance', 'Flashcard drill: dates and events', 'Group study or discussion'],
      ['Practice essay: introduction + 2 body paragraphs', 'Focus on evidence and argument quality', 'Peer review or self-review'],
      ['Timed full essay under exam conditions', 'Review against mark scheme', 'Final notes consolidation'],
    ],
    default: [
      ['Read and annotate lecture notes', 'Identify 5 key concepts to master', 'Create a concept mind map'],
      ['Active recall: cover notes and recite key ideas', 'Practice 10 past paper questions', 'Check and correct answers'],
      ['Focus on weakest topic from previous session', 'Find 2 additional example problems', 'Explain the concept aloud'],
      ['Timed practice: complete a past paper section', 'Review mark scheme carefully', 'Update your revision notes'],
      ['Final review: flashcards + summary sheet', 'Rest and light re-read of key definitions', 'Prepare exam materials'],
    ],
  };

  let tasks;
  for (const key of Object.keys(taskSets)) {
    if (subjectLC.includes(key)) { tasks = taskSets[key]; break; }
  }
  if (!tasks) tasks = taskSets.default;

  const sessionLabel = `(${totalMins >= 120 ? Math.floor(totalMins / 3) : totalMins}min)`;

  days.forEach((day, i) => {
    const set      = tasks[i % tasks.length];
    const dayTasks = set.map((t, j) => `${t} ${j === 0 ? sessionLabel : ''}`);
    plan[day]      = dayTasks;
  });

  return plan;
}

/* ================================================================
   Topic detection helper
   ================================================================ */

function _detectTopic(text) {
  const t = text.toLowerCase();
  if (/\b(cell|mitosis|dna|protein|enzyme|photosynthes|respir|genetics|organ|tissue)\b/.test(t)) return 'biology';
  if (/\b(atom|molecule|bond|reaction|acid|base|periodic|element|compound|mole)\b/.test(t))       return 'chemistry';
  if (/\b(war|revolution|empire|colonial|treaty|nation|histor|century|king|queen|battle)\b/.test(t)) return 'history';
  if (/\b(supply|demand|gdp|inflation|market|price|econom|fiscal|monetary|trade)\b/.test(t))      return 'economics';
  if (/\b(deriv|integr|calcul|matrix|vector|equation|theorem|polynomial|function|limit)\b/.test(t)) return 'math';
  if (/\b(algorithm|code|program|function|class|object|data structure|array|loop|variable)\b/.test(t)) return 'cs';
  if (/\b(force|velocity|acceleration|energy|wave|quantum|electric|magnetic|newton|mass)\b/.test(t)) return 'physics';
  return 'generic';
}

/**
 * Generic fallback _demoResponse (used when no task-specific demo applies).
 * This should rarely be reached since all task helpers now provide rich demos.
 */
function _demoResponse(systemPrompt, userPrompt) {
  const snippet = userPrompt.slice(0, 80).replace(/\n/g, ' ');
  return `[DEMO MODE] Input received: "${snippet}…"

This feature is running in Demo Mode (no API key configured).
Rich demo content is available for Summarizer, Quiz, Explainer, and Scheduler.
Add your API key via ⚙ Settings to activate real AI responses.`;
}
