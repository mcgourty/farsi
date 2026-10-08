// verbs.js: the verb list, the colloquial conjugation engine, English glosses,
// and the generated verb-meaning items. No DOM and no store access.
//
// To add a verb, add it to VERBS (or use kardanVerb/dadanVerb/zadanVerb).
// Its trainer entries and its meaning cards appear automatically. A verb's
// `id` is part of every card id and drill key built from it, so never
// rename one that has shipped.
(function (root) {
  'use strict';
  const F = root.F = root.F || {};

  // ===== Verb dataset =====
  const PERSONS = [
    { pin: 'man', fa: 'من', en: 'I' },
    { pin: 'to', fa: 'تو', en: 'you' },
    { pin: 'oon', fa: 'اون', en: 'he/she' },
    { pin: 'mā', fa: 'ما', en: 'we' },
    { pin: 'shomā', fa: 'شما', en: 'you (pl/formal)' },
    { pin: 'oonā', fa: 'اونا', en: 'they' },
  ];
  const END_PIN = ['am', 'i', 'eh', 'im', 'id', 'an'];
  const END_FA = ['م', 'ی', 'ه', 'یم', 'ید', 'ن'];
  const END_PIN_V = ['m', 'y', 'd', 'ym', 'yd', 'n'];
  const END_FA_V = ['م', 'ی', 'د', 'یم', 'ید', 'ن'];
  const DARAM_PIN = ['dāram', 'dāri', 'dāreh', 'dārim', 'dārid', 'dāran'];
  const DARAM_FA = ['دارم', 'داری', 'داره', 'داریم', 'دارید', 'دارن'];
  // Simple past: 3rd person singular takes no ending at all
  const PAST_END_PIN = ['am', 'i', '', 'im', 'id', 'an'];
  const PAST_END_FA = ['م', 'ی', '', 'یم', 'ید', 'ن'];

  function kardanVerb(id, faP, pinP, en) {
    return { id, fa: faP + ' کردن', pin: pinP + ' kardan', en,
      pre: { fa: faP, pin: pinP }, stem: 'kon', stemFa: 'کن',
      imp: { sg: pinP + ' kon', sgFa: faP + ' کن', pl: pinP + ' konid', plFa: faP + ' کنید',
             negSg: pinP + ' nakon', negSgFa: faP + ' نکن', negPl: pinP + ' nakonid', negPlFa: faP + ' نکنید' } };
  }
  function dadanVerb(id, faP, pinP, en) {
    return { id, fa: faP + ' دادن', pin: pinP + ' dādan', en,
      pre: { fa: faP, pin: pinP }, stem: 'd', stemFa: 'د',
      imp: { sg: pinP + ' bedeh', sgFa: faP + ' بده', pl: pinP + ' bedid', plFa: faP + ' بدید',
             negSg: pinP + ' nadeh', negSgFa: faP + ' نده', negPl: pinP + ' nadid', negPlFa: faP + ' ندید' } };
  }
  function zadanVerb(id, faP, pinP, en) {
    return { id, fa: faP + ' زدن', pin: pinP + ' zadan', en,
      pre: { fa: faP, pin: pinP }, stem: 'zan', stemFa: 'زن',
      imp: { sg: pinP + ' bezan', sgFa: faP + ' بزن', pl: pinP + ' bezanid', plFa: faP + ' بزنید',
             negSg: pinP + ' nazan', negSgFa: faP + ' نزن', negPl: pinP + ' nazanid', negPlFa: faP + ' نزنید' } };
  }

  const VERBS = [
    { id: 'boodan', fa: 'بودن', pin: 'boodan', en: 'to be', noCont: true,
      irregular: {
        pres: ['hastam','hasti','hast','hastim','hastid','hastan'],
        presFa: ['هستم','هستی','هست','هستیم','هستید','هستن'],
        neg: ['nistam','nisti','nist','nistim','nistid','nistan'],
        negFa: ['نیستم','نیستی','نیست','نیستیم','نیستید','نیستن'] },
      imp: { sg:'bāsh', sgFa:'باش', pl:'bāshid', plFa:'باشید', negSg:'nabāsh', negSgFa:'نباش', negPl:'nabāshid', negPlFa:'نباشید' } },
    { id: 'dashtan', fa: 'داشتن', pin: 'dāshtan', en: 'to have, to own', stem: 'dār', stemFa: 'دار', noMi: true, noCont: true,
      imp: { sg:'dāshte bāsh', sgFa:'داشته باش', pl:'dāshte bāshid', plFa:'داشته باشید', negSg:'nadāshte bāsh', negSgFa:'نداشته باش', negPl:'nadāshte bāshid', negPlFa:'نداشته باشید' } },
    { id: 'doost-dashtan', fa: 'دوست داشتن', pin: 'doost dāshtan', en: 'to like, to love', pre: { fa:'دوست', pin:'doost' }, stem: 'dār', stemFa: 'دار', noMi: true, noCont: true,
      imp: { sg:'doost dāshte bāsh', sgFa:'دوست داشته باش', pl:'doost dāshte bāshid', plFa:'دوست داشته باشید', negSg:'doost nadāshte bāsh', negSgFa:'دوست نداشته باش', negPl:'doost nadāshte bāshid', negPlFa:'دوست نداشته باشید' } },
    { id: 'alaghe-dashtan', fa: 'علاقه داشتن', pin: 'alāghe dāshtan (be)', en: 'to be interested (in)', pre: { fa:'علاقه', pin:'alāghe' }, stem: 'dār', stemFa: 'دار', noMi: true, noCont: true },
    { id: 'khastan', fa: 'خواستن', pin: 'khāstan', en: 'to want', stem: 'khā', stemFa: 'خوا', vowel: true, noCont: true,
      imp: { sg:'bekhāh', sgFa:'بخواه', pl:'bekhāhid', plFa:'بخواهید', negSg:'nakhāh', negSgFa:'نخواه', negPl:'nakhāhid', negPlFa:'نخواهید' } },
    { id: 'raftan', fa: 'رفتن', pin: 'raftan', en: 'to go', stem: 'r', stemFa: 'ر',
      imp: { sg:'boro', sgFa:'برو', pl:'berid', plFa:'برید', negSg:'naro', negSgFa:'نرو', negPl:'narid', negPlFa:'نرید' } },
    { id: 'oomadan', fa: 'اومدن', pin: 'oomadan', en: 'to come',
      irregular: {
        pres: ['miām','miāy','miād','miāym','miāyd','miān'],
        presFa: ['میام','میای','میاد','میایم','میاید','میان'],
        neg: ['nemiām','nemiāy','nemiād','nemiāym','nemiāyd','nemiān'],
        negFa: ['نمیام','نمیای','نمیاد','نمیایم','نمیاید','نمیان'] },
      negPast: 'nayoomad', negPastFa: 'نیومد',
      imp: { sg:'biā', sgFa:'بیا', pl:'biāyd', plFa:'بیاید', negSg:'nayā', negSgFa:'نیا', negPl:'nayāyd', negPlFa:'نیاید' } },
    { id: 'residan', fa: 'رسیدن', pin: 'residan', en: 'to arrive', stem: 'res', stemFa: 'رس',
      imp: { sg:'beres', sgFa:'برس', pl:'beresid', plFa:'برسید', negSg:'nares', negSgFa:'نرس', negPl:'naresid', negPlFa:'نرسید' } },
    { id: 'khordan', fa: 'خوردن', pin: 'khordan', en: 'to eat, to drink', stem: 'khor', stemFa: 'خور',
      imp: { sg:'bokhor', sgFa:'بخور', pl:'bokhorid', plFa:'بخورید', negSg:'nakhor', negSgFa:'نخور', negPl:'nakhorid', negPlFa:'نخورید' } },
    { id: 'nooshidan', fa: 'نوشیدن', pin: 'nooshidan', en: 'to drink', stem: 'noosh', stemFa: 'نوش',
      imp: { sg:'benoosh', sgFa:'بنوش', pl:'benooshid', plFa:'بنوشید', negSg:'nanoosh', negSgFa:'ننوش', negPl:'nanooshid', negPlFa:'ننوشید' } },
    { id: 'goftan', fa: 'گفتن', pin: 'goftan', en: 'to say, to tell', stem: 'g', stemFa: 'گ',
      imp: { sg:'begoo', sgFa:'بگو', pl:'begid', plFa:'بگید', negSg:'nagoo', negSgFa:'نگو', negPl:'nagid', negPlFa:'نگید' } },
    { id: 'dadan', fa: 'دادن', pin: 'dādan', en: 'to give', stem: 'd', stemFa: 'د',
      imp: { sg:'bedeh', sgFa:'بده', pl:'bedid', plFa:'بدید', negSg:'nadeh', negSgFa:'نده', negPl:'nadid', negPlFa:'ندید' } },
    dadanVerb('sefaresh-dadan', 'سفارش', 'sefāresh', 'to order'),
    dadanVerb('goosh-dadan', 'گوش', 'goosh', 'to listen'),
    dadanVerb('dars-dadan', 'درس', 'dars', 'to teach'),
    dadanVerb('ghaza-dadan', 'غذا', 'ghazā', 'to feed'),
    dadanVerb('ab-dadan', 'آب', 'āb', 'to water (plants)'),
    { id: 'khoondan', fa: 'خوندن', pin: 'khoondan', en: 'to read', stem: 'khoon', stemFa: 'خون',
      imp: { sg:'bekhoon', sgFa:'بخون', pl:'bekhoonid', plFa:'بخونید', negSg:'nakhoon', negSgFa:'نخون', negPl:'nakhoonid', negPlFa:'نخونید' } },
    { id: 'dars-khoondan', fa: 'درس خوندن', pin: 'dars khoondan', en: 'to study', pre: { fa:'درس', pin:'dars' }, stem: 'khoon', stemFa: 'خون',
      imp: { sg:'dars bekhoon', sgFa:'درس بخون', pl:'dars bekhoonid', plFa:'درس بخونید', negSg:'dars nakhoon', negSgFa:'درس نخون', negPl:'dars nakhoonid', negPlFa:'درس نخونید' } },
    { id: 'avaz-khoondan', fa: 'آواز خوندن', pin: 'āvāz khoondan', en: 'to sing', pre: { fa:'آواز', pin:'āvāz' }, stem: 'khoon', stemFa: 'خون',
      imp: { sg:'āvāz bekhoon', sgFa:'آواز بخون', pl:'āvāz bekhoonid', plFa:'آواز بخونید', negSg:'āvāz nakhoon', negSgFa:'آواز نخون', negPl:'āvāz nakhoonid', negPlFa:'آواز نخونید' } },
    { id: 'doonestan', fa: 'دونستن', pin: 'doonestan', en: 'to know', stem: 'doon', stemFa: 'دون', noCont: true },
    { id: 'raghsidan', fa: 'رقصیدن', pin: 'raghsidan', en: 'to dance', stem: 'raghs', stemFa: 'رقص',
      imp: { sg:'beraghs', sgFa:'برقص', pl:'beraghsid', plFa:'برقصید', negSg:'naraghs', negSgFa:'نرقص', negPl:'naraghsid', negPlFa:'نرقصید' } },
    { id: 'pichidan', fa: 'پیچیدن', pin: 'pichidan', en: 'to spread, to echo, to wind', stem: 'pich', stemFa: 'پیچ',
      imp: { sg:'bepich', sgFa:'بپیچ', pl:'bepichid', plFa:'بپیچید', negSg:'napich', negSgFa:'نپیچ', negPl:'napichid', negPlFa:'نپیچید' } },
    { id: 'khandidan', fa: 'خندیدن', pin: 'khandidan', en: 'to laugh', stem: 'khand', stemFa: 'خند',
      imp: { sg:'bekhand', sgFa:'بخند', pl:'bekhandid', plFa:'بخندید', negSg:'nakhand', negSgFa:'نخند', negPl:'nakhandid', negPlFa:'نخندید' } },
    { id: 'tarsidan', fa: 'ترسیدن', pin: 'tarsidan (az)', en: 'to fear, to be afraid (of)', stem: 'tars', stemFa: 'ترس',
      imp: { sg:'betars', sgFa:'بترس', pl:'betarsid', plFa:'بترسید', negSg:'natars', negSgFa:'نترس', negPl:'natarsid', negPlFa:'نترسید' } },
    { id: 'neshastan', fa: 'نشستن', pin: 'neshastan', en: 'to sit', stem: 'shin', stemFa: 'شین',
      imp: { sg:'beshin', sgFa:'بشین', pl:'beshinid', plFa:'بشینید', negSg:'nashin', negSgFa:'نشین', negPl:'nashinid', negPlFa:'نشینید' } },
    { id: 'shostan', fa: 'شستن', pin: 'shostan', en: 'to wash', stem: 'shoor', stemFa: 'شور',
      imp: { sg:'beshoor', sgFa:'بشور', pl:'beshoorid', plFa:'بشورید', negSg:'nashoor', negSgFa:'نشور', negPl:'nashoorid', negPlFa:'نشورید' } },
    { id: 'pokhtan', fa: 'پختن', pin: 'pokhtan', en: 'to cook, to bake', stem: 'paz', stemFa: 'پز',
      imp: { sg:'bepaz', sgFa:'بپز', pl:'bepazid', plFa:'بپزید', negSg:'napaz', negSgFa:'نپز', negPl:'napazid', negPlFa:'نپزید' } },
    { id: 'mordan', fa: 'مردن', pin: 'mordan', en: 'to die', stem: 'mir', stemFa: 'میر' },
    { id: 'didan', fa: 'دیدن', pin: 'didan', en: 'to see', stem: 'bin', stemFa: 'بین',
      imp: { sg:'bebin', sgFa:'ببین', pl:'bebinid', plFa:'ببینید', negSg:'nabin', negSgFa:'نبین', negPl:'nabinid', negPlFa:'نبینید' } },
    { id: 'rah-raftan', fa: 'راه رفتن', pin: 'rāh raftan', en: 'to walk', pre: { fa:'راه', pin:'rāh' }, stem: 'r', stemFa: 'ر',
      imp: { sg:'rāh boro', sgFa:'راه برو', pl:'rāh berid', plFa:'راه برید', negSg:'rāh naro', negSgFa:'راه نرو', negPl:'rāh narid', negPlFa:'راه نرید' } },
    { id: 'kharidan', fa: 'خریدن', pin: 'kharidan', en: 'to buy', stem: 'khar', stemFa: 'خر',
      imp: { sg:'bekhar', sgFa:'بخر', pl:'bekharid', plFa:'بخرید', negSg:'nakhar', negSgFa:'نخر', negPl:'nakharid', negPlFa:'نخرید' } },
    { id: 'forukhtan', fa: 'فروختن', pin: 'forukhtan', en: 'to sell', stem: 'foroush', stemFa: 'فروش',
      imp: { sg:'beforoush', sgFa:'بفروش', pl:'beforushid', plFa:'بفروشید', negSg:'naforoush', negSgFa:'نفروش', negPl:'naforushid', negPlFa:'نفروشید' } },
    { id: 'khabidan', fa: 'خوابیدن', pin: 'khābidan', en: 'to sleep, to go to bed', stem: 'khāb', stemFa: 'خواب',
      imp: { sg:'bekhāb', sgFa:'بخواب', pl:'bekhābid', plFa:'بخوابید', negSg:'nakhāb', negSgFa:'نخواب', negPl:'nakhābid', negPlFa:'نخوابید' } },
    { id: 'shodan', fa: 'شدن', pin: 'shodan', en: 'to become, to get', stem: 'sh', stemFa: 'ش',
      imp: { sg:'sho', sgFa:'شو', pl:'beshid', plFa:'بشید', negSg:'nasho', negSgFa:'نشو', negPl:'nashid', negPlFa:'نشید' } },
    { id: 'bidar-shodan', fa: 'بیدار شدن', pin: 'bidār shodan', en: 'to wake up', pre: { fa:'بیدار', pin:'bidār' }, stem: 'sh', stemFa: 'ش',
      imp: { sg:'bidār sho', sgFa:'بیدار شو', pl:'bidār beshid', plFa:'بیدار بشید', negSg:'bidār nasho', negSgFa:'بیدار نشو', negPl:'bidār nashid', negPlFa:'بیدار نشید' } },
    { id: 'amade-shodan', fa: 'آماده شدن', pin: 'āmādeh shodan', en: 'to get ready', pre: { fa:'آماده', pin:'āmādeh' }, stem: 'sh', stemFa: 'ش',
      imp: { sg:'āmādeh sho', sgFa:'آماده شو', pl:'āmādeh beshid', plFa:'آماده بشید', negSg:'āmādeh nasho', negSgFa:'آماده نشو', negPl:'āmādeh nashid', negPlFa:'آماده نشید' } },
    { id: 'bastan', fa: 'بستن', pin: 'bastan', en: 'to close, to tie', stem: 'band', stemFa: 'بند',
      imp: { sg:'beband', sgFa:'ببند', pl:'bebandid', plFa:'ببندید', negSg:'naband', negSgFa:'نبند', negPl:'nabandid', negPlFa:'نبندید' } },
    { id: 'kardan', fa: 'کردن', pin: 'kardan', en: 'to do', stem: 'kon', stemFa: 'کن',
      imp: { sg:'bokon', sgFa:'بکن', pl:'bokonid', plFa:'بکنید', negSg:'nakon', negSgFa:'نکن', negPl:'nakonid', negPlFa:'نکنید' } },
    kardanVerb('fekr-kardan', 'فکر', 'fekr', 'to think'),
    kardanVerb('safar-kardan', 'سفر', 'safar', 'to travel'),
    kardanVerb('zendegi-kardan', 'زندگی', 'zendegi', 'to live'),
    kardanVerb('kar-kardan', 'کار', 'kār', 'to work'),
    kardanVerb('varzesh-kardan', 'ورزش', 'varzesh', 'to exercise'),
    kardanVerb('bazi-kardan', 'بازی', 'bāzi', 'to play'),
    kardanVerb('ashpazi-kardan', 'آشپزی', 'āshpazi', 'to cook'),
    kardanVerb('dorost-kardan', 'درست', 'dorost', 'to make, to fix'),
    kardanVerb('yaddasht-kardan', 'یادداشت', 'yād dāsht', 'to note down'),
    kardanVerb('tamiz-kardan', 'تمیز', 'tamiz', 'to clean'),
    kardanVerb('amade-kardan', 'آماده', 'āmāde', 'to prepare'),
    kardanVerb('ejare-kardan', 'اجاره', 'ejāre', 'to rent'),
    kardanVerb('ranandegi-kardan', 'رانندگی', 'rānandegi', 'to drive'),
    kardanVerb('piaderavi-kardan', 'پیاده‌روی', 'piāderavi', 'to walk (for exercise)'),
    kardanVerb('kharid-kardan', 'خرید', 'kharid', 'to shop'),
    kardanVerb('baz-kardan', 'باز', 'bāz', 'to open'),
    kardanVerb('tamasha-kardan', 'تماشا', 'tamāshā', 'to watch'),
    kardanVerb('komak-kardan', 'کمک', 'komak', 'to help'),
    kardanVerb('dard-kardan', 'درد', 'dard', 'to hurt, to ache'),
    kardanVerb('tamir-kardan', 'تعمیر', 'tamir', 'to repair, to service'),
    kardanVerb('arayesh-kardan', 'آرایش', 'ārāyesh', 'to put on makeup'),
    kardanVerb('docharkheh-savari-kardan', 'دوچرخه‌سواری', 'docharkheh savāri', 'to ride a bike, to cycle'),
    kardanVerb('asb-savari-kardan', 'اسب‌سواری', 'asb savāri', 'to ride a horse'),
    kardanVerb('sohbat-kardan', 'صحبت', 'sohbat', 'to talk, to speak'),
    kardanVerb('tosif-kardan', 'توصیف', 'tosif', 'to describe'),
    // بر- is a prefix written joined to the verb (برمی‌دارم, برنداشتم), so the
    // spaced `pre` mechanism can't build it. Present/negative are listed out;
    // past, neg. past and the imperatives come from the normal fields.
    { id: 'bardashtan', fa: 'برداشتن', pin: 'bardāshtan', en: 'to pick up, to take, to remove',
      irregular: {
        pres: ['barmidāram','barmidāri','barmidāreh','barmidārim','barmidārid','barmidāran'],
        presFa: ['برمی‌دارم','برمی‌داری','برمی‌داره','برمی‌داریم','برمی‌دارید','برمی‌دارن'],
        neg: ['barnemidāram','barnemidāri','barnemidāreh','barnemidārim','barnemidārid','barnemidāran'],
        negFa: ['برنمی‌دارم','برنمی‌داری','برنمی‌داره','برنمی‌داریم','برنمی‌دارید','برنمی‌دارن'] },
      negPast: 'barnadāsht', negPastFa: 'برنداشت',
      imp: { sg:'bardār', sgFa:'بردار', pl:'bardārid', plFa:'بردارید', negSg:'barnadār', negSgFa:'برندار', negPl:'barnadārid', negPlFa:'برندارید' } },
    // Present stem گذار is spoken ذار: می‌ذارم (formal می‌گذارم), بذار (formal بگذار)
    { id: 'gozashtan', fa: 'گذاشتن', pin: 'gozāshtan', en: 'to put, to place', stem: 'zār', stemFa: 'ذار',
      imp: { sg:'bezār', sgFa:'بذار', pl:'bezārid', plFa:'بذارید', negSg:'nazār', negSgFa:'نذار', negPl:'nazārid', negPlFa:'نذارید' } },
    { id: 'zadan', fa: 'زدن', pin: 'zadan', en: 'to hit, to strike', stem: 'zan', stemFa: 'زن',
      imp: { sg:'bezan', sgFa:'بزن', pl:'bezanid', plFa:'بزنید', negSg:'nazan', negSgFa:'نزن', negPl:'nazanid', negPlFa:'نزنید' } },
    zadanVerb('dast-zadan', 'دست', 'dast', 'to clap; to touch (with be)'),
    zadanVerb('dar-zadan', 'در', 'dar', 'to knock'),
    zadanVerb('zang-zadan', 'زنگ', 'zang', 'to call, to ring'),
    zadanVerb('telefon-zadan', 'تلفن', 'telefon', 'to call (on the phone)'),
    zadanVerb('harf-zadan', 'حرف', 'harf', 'to talk'),
    zadanVerb('saz-zadan', 'ساز', 'sāz', 'to play an instrument'),
    zadanVerb('piano-zadan', 'پیانو', 'piāno', 'to play the piano'),
    zadanVerb('cheshmak-zadan', 'چشمک', 'cheshmak', 'to wink'),
    zadanVerb('mesvak-zadan', 'مسواک', 'mesvāk', 'to brush one\'s teeth'),
    zadanVerb('shaneh-zadan', 'شونه', 'shooneh', 'to comb'),
    zadanVerb('rang-zadan', 'رنگ', 'rang', 'to paint'),
    zadanVerb('gap-zadan', 'گپ', 'gap', 'to chat'),
    zadanVerb('seda-zadan', 'صدا', 'sedā', 'to call someone (by name)'),
    zadanVerb('sut-zadan', 'سوت', 'soot', 'to whistle'),
    zadanVerb('kotak-zadan', 'کتک', 'kotak', 'to beat, to hit (a person)'),
  ];

  const TENSES = [
    { id: 'present', label: 'Present', desc: 'present \u2014 does / will do' },
    { id: 'negative', label: 'Negative', desc: "negative \u2014 doesn't" },
    { id: 'past', label: 'Past', desc: 'simple past \u2014 did' },
    { id: 'pastneg', label: 'Neg. past', desc: "simple past \u2014 didn't" },
    { id: 'continuous', label: 'Continuous (dāram...)', desc: 'right now \u2014 dāram + mi...' },
    { id: 'imperative', label: 'Imperative', desc: 'command \u2014 do it!' },
    { id: 'impneg', label: 'Neg. imperative', desc: "command \u2014 don't!" },
  ];


  // ===== Conjugation engine (colloquial Tehrani forms) =====
  // Past stem = infinitive minus the final -an / -ن (true for every Persian verb)
  function pastStem(v) {
    if (v.pastStem) return { pin: v.pastStem, fa: v.pastStemFa };
    const pinTok = v.pin.replace(/\s*\([^)]*\)\s*/g, ' ').trim().split(/\s+/).pop();
    const faTok = v.fa.trim().split(/\s+/).pop();
    return { pin: pinTok.replace(/an$/, ''), fa: faTok.replace(/ن$/, '') };
  }

  function conj(v, tense, pi) {
    if (tense === 'continuous') {
      if (v.noCont) return null;
      const base = conj(v, 'present', pi);
      return { pin: DARAM_PIN[pi] + ' ' + base.pin, fa: DARAM_FA[pi] + ' ' + base.fa };
    }
    if (tense === 'past' || tense === 'pastneg') {
      const neg = tense === 'pastneg';
      const ps = pastStem(v);
      const sPin = neg ? (v.negPast || ('na' + ps.pin)) : ps.pin;
      const sFa = neg ? (v.negPastFa || ('ن' + ps.fa)) : ps.fa;
      return {
        pin: (v.pre ? v.pre.pin + ' ' : '') + sPin + PAST_END_PIN[pi],
        fa: (v.pre ? v.pre.fa + ' ' : '') + sFa + PAST_END_FA[pi],
      };
    }
    if (v.irregular) {
      const p = tense === 'present' ? v.irregular.pres : v.irregular.neg;
      const f = tense === 'present' ? v.irregular.presFa : v.irregular.negFa;
      return { pin: p[pi], fa: f[pi] };
    }
    const end = (v.vowel ? END_PIN_V : END_PIN)[pi];
    const endFa = (v.vowel ? END_FA_V : END_FA)[pi];
    let core, coreFa;
    if (v.noMi) {
      core = (tense === 'negative' ? 'na' : '') + v.stem + end;
      coreFa = (tense === 'negative' ? 'ن' : '') + v.stemFa + endFa;
    } else {
      core = (tense === 'negative' ? 'nemi' : 'mi') + v.stem + end;
      coreFa = (tense === 'negative' ? 'نمی\u200C' : 'می\u200C') + v.stemFa + endFa;
    }
    return {
      pin: (v.pre ? v.pre.pin + ' ' : '') + core,
      fa: (v.pre ? v.pre.fa + ' ' : '') + coreFa,
    };
  }

  function drillKey(d) { return `${d.v.id}|${d.tense}|${d.pi}`; }

  function drillAnswer(d) {
    const v = d.v;
    if (d.tense === 'imperative' || d.tense === 'impneg') {
      const neg = d.tense === 'impneg';
      const pl = d.pi === 4;
      return {
        pin: neg ? (pl ? v.imp.negPl : v.imp.negSg) : (pl ? v.imp.pl : v.imp.sg),
        fa: neg ? (pl ? v.imp.negPlFa : v.imp.negSgFa) : (pl ? v.imp.plFa : v.imp.sgFa),
      };
    }
    return conj(v, d.tense, d.pi);
  }

  function drillBreakdown(d) {
    const v = d.v;
    if (d.tense === 'imperative') return 'imperative of ' + v.pin;
    if (d.tense === 'impneg') return 'negative imperative of ' + v.pin;
    if (d.tense === 'past' || d.tense === 'pastneg') {
      const ps = pastStem(v);
      const neg = d.tense === 'pastneg';
      const stem = neg ? (v.negPast || ('na + ' + ps.pin)) : ps.pin;
      const e = PAST_END_PIN[d.pi];
      let s = stem + (e ? ' + ' + e : ' + nothing (3rd person sing.)');
      if (v.pre) s = v.pre.pin + ' + ' + s;
      return s + '  \u2014  past stem: ' + ps.pin;
    }
    if (v.irregular) return v.pin + ' is irregular \u2014 memorize it!';
    const end = (v.vowel ? END_PIN_V : END_PIN)[d.pi];
    let s = v.noMi
      ? (d.tense === 'negative' ? 'na + ' : '') + v.stem + ' + ' + end
      : (d.tense === 'negative' ? 'nemi' : 'mi') + ' + ' + v.stem + ' + ' + end;
    if (v.pre) s = v.pre.pin + ' + ' + s;
    if (d.tense === 'continuous') s = DARAM_PIN[d.pi] + ' + ' + s;
    return s;
  }

  // ===== Verb meaning cards (general flashcards) =====
  //
  // The trainer drills *producing* a form. These cards drill *what it means*,
  // both ways, for every person × tense the engine can build.

  const EN_SUBJ = ['I', 'you', 'he/she', 'we', 'you (pl/formal)', 'they'];
  const EN_POSS = ['my', 'your', 'their', 'our', 'your', 'their'];
  const EN_BE_PRES = ['am', 'are', 'is', 'are', 'are', 'are'];
  const EN_BE_PAST = ['was', 'were', 'was', 'were', 'were', 'were'];
  const EN_FUT = ["I'll", "you'll", "he/she'll", "we'll", "you'll", "they'll"];
  const EN_NO_FUTURE = new Set(['be', 'have', 'own', 'know', 'want', 'like', 'love']);
  const EN_DOUBLE = new Set(['shop', 'chat', 'get', 'put', 'hit', 'sit', 'clap', 'stop', 'plan']);
  const EN_IRREG = {
    be: {},
    have: { pres3: 'has', past: 'had', gerund: 'having' },
    do: { pres3: 'does', past: 'did', gerund: 'doing' },
    go: { past: 'went' },
    come: { past: 'came' },
    eat: { past: 'ate' },
    drink: { past: 'drank' },
    say: { past: 'said' },
    tell: { past: 'told' },
    give: { past: 'gave', gerund: 'giving' },
    see: { past: 'saw', gerund: 'seeing' },
    sit: { past: 'sat', gerund: 'sitting' },
    get: { past: 'got', gerund: 'getting' },
    make: { past: 'made', gerund: 'making' },
    buy: { past: 'bought' },
    sell: { past: 'sold' },
    sleep: { past: 'slept' },
    wake: { past: 'woke', gerund: 'waking' },
    become: { past: 'became', gerund: 'becoming' },
    hit: { past: 'hit', gerund: 'hitting' },
    strike: { past: 'struck', gerund: 'striking' },
    know: { past: 'knew', gerund: 'knowing' },
    think: { past: 'thought' },
    teach: { pres3: 'teaches', past: 'taught' },
    feed: { past: 'fed' },
    read: { past: 'read' },
    speak: { past: 'spoke', gerund: 'speaking' },
    put: { past: 'put', gerund: 'putting' },
    take: { past: 'took' },
    hurt: { past: 'hurt' },
    ride: { past: 'rode', gerund: 'riding' },
    beat: { past: 'beat' },
    ring: { past: 'rang' },
    die: { pres3: 'dies', past: 'died', gerund: 'dying' },
    live: { pres3: 'lives', past: 'lived' },
    sing: { past: 'sang' },
    spread: { past: 'spread' },
    wind: { past: 'wound' },
    drive: { past: 'drove', gerund: 'driving' },
  };

  function enPres3(verb) {
    if (EN_IRREG[verb] && EN_IRREG[verb].pres3) return EN_IRREG[verb].pres3;
    if (/[sxz]$|[cs]h$/.test(verb) || /[^aeiou]o$/.test(verb)) return verb + 'es';
    if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + 'ies';
    return verb + 's';
  }

  function enPastForm(verb) {
    if (EN_IRREG[verb] && EN_IRREG[verb].past) return EN_IRREG[verb].past;
    if (verb.endsWith('e')) return verb + 'd';
    if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + 'ied';
    if (EN_DOUBLE.has(verb)) return verb + verb.slice(-1) + 'ed';
    return verb + 'ed';
  }

  function enGerund(verb) {
    if (EN_IRREG[verb] && EN_IRREG[verb].gerund) return EN_IRREG[verb].gerund;
    if (verb.endsWith('ie')) return verb.slice(0, -2) + 'ying';
    if (verb.endsWith('e') && !verb.endsWith('ee')) return verb.slice(0, -1) + 'ing';
    if (EN_DOUBLE.has(verb)) return verb + verb.slice(-1) + 'ing';
    return verb + 'ing';
  }

  function enSenses(en) {
    return String(en).split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => s.replace(/^to\s+/, ''));
  }

  function enSplitHead(sense) {
    let note = '';
    const m = sense.match(/^(.*?)(\s*\([^)]*\))$/);
    let head = sense;
    if (m) { head = m[1].trim(); note = m[2]; }
    if (head === 'be' || head.startsWith('be ')) {
      return { verb: 'be', rest: head.slice(2).trim(), note };
    }
    const i = head.indexOf(' ');
    return i < 0
      ? { verb: head, rest: '', note }
      : { verb: head.slice(0, i), rest: head.slice(i + 1), note };
  }

  function enRest(rest, note, pi, forImp) {
    let r = rest || '';
    if (r) r = r.replace(/\bone's\b/g, forImp ? 'your' : EN_POSS[pi]);
    return (r ? ' ' + r : '') + (note || '');
  }

  function enFinite(sense, tense, pi) {
    const { verb, rest, note } = enSplitHead(sense);
    const subj = EN_SUBJ[pi];
    const r = enRest(rest, note, pi, false);
    if (verb === 'be') {
      if (tense === 'present') return `${subj} ${EN_BE_PRES[pi]}${r}`;
      if (tense === 'negative') return `${subj} ${EN_BE_PRES[pi]} not${r}`;
      if (tense === 'past') return `${subj} ${EN_BE_PAST[pi]}${r}`;
      if (tense === 'pastneg') return `${subj} ${EN_BE_PAST[pi]} not${r}`;
      if (tense === 'continuous') return `${subj} ${EN_BE_PRES[pi]}${r} right now`;
    }
    if (tense === 'present') {
      const v = pi === 2 ? enPres3(verb) : verb;
      const now = `${subj} ${v}${r}`;
      if (EN_NO_FUTURE.has(verb)) return now;
      return `${now} / ${EN_FUT[pi]} ${verb}${r}`;
    }
    if (tense === 'negative') {
      const aux = pi === 2 ? "doesn't" : "don't";
      return `${subj} ${aux} ${verb}${r}`;
    }
    if (tense === 'past') return `${subj} ${enPastForm(verb)}${r}`;
    if (tense === 'pastneg') return `${subj} didn't ${verb}${r}`;
    if (tense === 'continuous') return `${subj} ${EN_BE_PRES[pi]} ${enGerund(verb)}${r} right now`;
    return `${subj} ${verb}${r}`;
  }

  function enCommand(sense, neg, plural) {
    const { verb, rest, note } = enSplitHead(sense);
    const r = enRest(rest, note, 1, true);
    const who = plural ? ' (formal/plural)' : '';
    if (verb === 'be') {
      const core = (neg ? "Don't be" : 'Be') + r;
      return core + '!' + who;
    }
    const stem = verb.charAt(0).toUpperCase() + verb.slice(1);
    const core = (neg ? "Don't " + verb : stem) + r;
    return core + '!' + who;
  }

  function enMeaning(v, tense, pi) {
    const senses = enSenses(v.en);
    const isImp = tense === 'imperative' || tense === 'impneg';
    const parts = senses.map(s => isImp
      ? enCommand(s, tense === 'impneg', pi === 4)
      : enFinite(s, tense, pi));
    const seen = new Set();
    const uniq = [];
    for (const p of parts) if (!seen.has(p)) { seen.add(p); uniq.push(p); }
    return uniq.join(' / ');
  }

  function verbCardBreakdown(v, tense, pi) {
    if (tense === 'infinitive') {
      return `${v.fa} \u00B7 ${v.pin} \u00B7 infinitive \u2014 dictionary form`;
    }
    const t = TENSES.find(x => x.id === tense);
    const isImp = tense === 'imperative' || tense === 'impneg';
    const person = isImp
      ? (pi === 4 ? 'shomā \u2014 you (pl/formal)' : 'to \u2014 you')
      : `${PERSONS[pi].pin} \u2014 ${PERSONS[pi].en}`;
    return `${v.fa} \u00B7 ${v.pin} \u00B7 ${t ? t.label : tense} \u00B7 ${person}<br>${drillBreakdown({ v, tense, pi })}`;
  }

  // Person codes used in verb card ids: verb.<verbId>.<tense>.<person>
  const PERSON_CODES = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];

  // Every verb-meaning item, in deck order. Each one becomes two cards
  // (fa-en and en-fa) in cards.js. The item id is stable: verb id + form,
  // e.g. verb.boodan.inf, verb.boodan.past.3pl, verb.raftan.imperative.2pl.
  function meaningItems() {
    const items = [];
    for (const v of VERBS) {
      items.push({ id: `verb.${v.id}.inf`, verb: v.id, tense: 'infinitive', pi: null,
        fa: v.fa, pin: v.pin, en: v.en, notes: verbCardBreakdown(v, 'infinitive', 0) });
      for (const t of TENSES) {
        if (t.id === 'continuous' && v.noCont) continue;
        if ((t.id === 'imperative' || t.id === 'impneg') && !v.imp) continue;
        const pis = (t.id === 'imperative' || t.id === 'impneg') ? [1, 4] : [0, 1, 2, 3, 4, 5];
        for (const pi of pis) {
          const form = drillAnswer({ v, tense: t.id, pi });
          if (!form || !form.fa) continue;
          const english = `${enMeaning(v, t.id, pi)} \u2014 ${v.pin}`;
          items.push({ id: `verb.${v.id}.${t.id}.${PERSON_CODES[pi]}`, verb: v.id, tense: t.id, pi,
            fa: form.fa, pin: form.pin, en: english, notes: verbCardBreakdown(v, t.id, pi) });
        }
      }
    }
    return items;
  }

  function personLabel(tense, pi) {
    const isImp = tense === 'imperative' || tense === 'impneg';
    return isImp
      ? (pi === 4 ? 'shom\u0101 \u2014 you (pl/formal)' : 'to \u2014 you')
      : `${PERSONS[pi].pin} \u2014 ${PERSONS[pi].en}`;
  }

  F.verbs = {
    PERSONS, TENSES, VERBS, PERSON_CODES, DARAM_PIN, DARAM_FA,
    pastStem, conj, drillKey, drillAnswer, drillBreakdown,
    enMeaning, verbCardBreakdown, meaningItems, personLabel,
    byId: id => VERBS.find(v => v.id === id) || null,
  };
})(typeof window !== 'undefined' ? window : globalThis);
