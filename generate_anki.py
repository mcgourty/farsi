#!/usr/bin/env python3
"""
Generate Anki deck from Farsi lessons.
Run: python3 generate_anki.py
Output: farsi_cursor_agent.apkg (import into Anki)
"""

import genanki
import random

# Create unique IDs for the model and deck
MODEL_ID = 1769630000000 + random.randint(1, 999999)
DECK_ID = 1769630000000 + random.randint(1, 999999)

# Define a custom note model with Front/Back
farsi_model = genanki.Model(
    MODEL_ID,
    'Farsi Vocabulary (Cursor Agent)',
    fields=[
        {'name': 'Front'},
        {'name': 'Back'},
    ],
    templates=[
        {
            'name': 'Card 1',
            'qfmt': '{{Front}}',
            'afmt': '{{FrontSide}}<hr id="answer">{{Back}}',
        },
    ],
    css='''
    .card {
        font-family: Arial, sans-serif;
        font-size: 24px;
        text-align: center;
        color: black;
        background-color: white;
    }
    .farsi {
        font-size: 36px;
        direction: rtl;
        margin: 20px 0;
    }
    .pinglish {
        font-size: 20px;
        color: #666;
        font-style: italic;
    }
    .meaning {
        font-size: 24px;
        margin: 10px 0;
    }
    .breakdown {
        font-size: 16px;
        color: #888;
        margin-top: 15px;
        text-align: left;
        direction: ltr;
    }
    hr {
        border: 1px solid #ccc;
    }
    '''
)

# Create the deck
deck = genanki.Deck(DECK_ID, 'Farsi - Cursor Agent')

# ============================================================
# SESSION 22 VOCABULARY
# ============================================================

session_22_vocab = [
    # (Farsi, Pinglish, English, Letter Breakdown)
    ("ورزش کردن", "varzesh kardan", "to exercise", "و-ر-ز-ش ک-ر-د-ن"),
    ("وَ", "va", "and", "و (vāv)"),
    ("مِسواک", "mesvāk", "toothbrush", "م-س-و-ا-ک"),
    ("میوه", "miveh", "fruit", "م-ی-و-ه"),
    ("لیوان", "livān", "glass", "ل-ی-و-ا-ن"),
    ("پَروانه", "parvāneh", "butterfly", "پ-ر-و-ا-ن-ه"),
    ("او / اون", "oo / oon", "he, she", "ا-و (formal) / ا-و-ن (colloquial)"),
    ("روز", "rooz", "day", "ر-و-ز"),
    ("امروز", "emrooz", "today", "ا-م-ر-و-ز (lit: this day)"),
    ("خوب", "khoob", "good", "خ-و-ب"),
    ("دوست", "doost", "friend", "د-و-س-ت"),
    ("شور", "shoor", "salty", "ش-و-ر"),
    ("اُردَک", "ordak", "duck", "ا-ر-د-ک"),
    ("خُوش", "khosh", "pleasant", "خ-و-ش"),
    ("خُوشمَزه", "khoshmaze", "delicious", "خوش (pleasant) + مزه (taste)"),
    ("تو", "to", "you (informal)", "ت-و"),
    ("پُلُو", "polo", "cooked rice", "پ-ل-و"),
    ("دو", "do", "two", "د-و"),
    ("خود", "khod", "self", "خ-و-د"),
    ("خودکار", "khodkār", "pen (ballpoint)", "خود (self) + کار (work) = automatic"),
    ("مترو", "metro", "metro, subway", "م-ت-ر-و"),
    ("گیلاس", "gilās", "cherry", "گ-ی-ل-ا-س"),
    ("گُربه", "gorbeh", "cat", "گ-ر-ب-ه"),
    ("سَگ", "sag", "dog", "س-گ"),
    ("زندگی", "zendegi", "life", "ز-ن-د-گ-ی"),
    ("گاو", "gāv", "cow", "گ-ا-و"),
    ("این", "in", "this", "ا-ی-ن"),
    ("آن / اون", "ān / oon", "that", "ا-ی-ن (formal) / ا-و-ن (colloquial)"),
    ("اینجا", "injā", "here", "این (this) + جا (place)"),
    ("آنجا", "ānjā", "there", "آن (that) + جا (place)"),
    ("چطور", "chetor", "how", "چ-ط-و-ر"),
    ("مامان", "māmān", "mom", "م-ا-م-ا-ن"),
    ("بابا", "bābā", "dad", "ب-ا-ب-ا"),
    ("مامان‌بزرگ", "māmānbozorg", "grandmother", "مامان + بزرگ (big)"),
    ("بابابزرگ", "bābābozorg", "grandfather", "بابا + بزرگ (big)"),
    ("خیلی", "kheili", "very", "خ-ی-ل-ی"),
    ("ممنون", "mamnoon", "thank you", "م-م-ن-و-ن"),
    ("بد", "bad", "bad", "ب-د"),
    ("ایرانی", "irāni", "Iranian", "ایران + ی"),
    ("باهوش", "bāhoosh", "smart", "با (with) + هوش (intelligence)"),
]

session_22_grammar = [
    # To be - formal
    ("من هستم", "man hastam", "I am", "هستم = am (1st person singular)"),
    ("تو هستی", "to hasti", "you are (informal)", "هستی = are (2nd person singular)"),
    ("او هست", "oo hast", "he/she is", "هست = is (3rd person singular)"),
    ("ما هستیم", "mā hastim", "we are", "هستیم = are (1st person plural)"),
    ("شما هستید", "shomā hastid", "you are (formal/plural)", "هستید = are (2nd person plural)"),
    ("آنها هستند", "ānhā hastand", "they are", "هستند = are (3rd person plural)"),
    
    # To be - colloquial suffixes
    ("خوبم", "khoobam", "I am good", "خوب + ـَم (I am)"),
    ("خوبی", "khoobi", "you are good", "خوب + ـی (you are)"),
    ("خوبه", "khoobeh", "he/she is good", "خوب + ـه (he/she is)"),
    ("خوبیم", "khoobim", "we are good", "خوب + ـیم (we are)"),
    ("خوبید", "khoobid", "you are good (pl)", "خوب + ـید (you are)"),
    ("خوبند", "khooband", "they are good", "خوب + ـند (they are)"),
]

session_22_phrases = [
    ("تو چطوری؟", "to chetori?", "How are you? (informal)", "تو (you) + چطوری (how)"),
    ("شما چطورید؟", "shomā chetorid?", "How are you? (formal)", "شما (you formal) + چطورید (how are)"),
    ("مامان و بابا چطورند؟", "māmān o bābā chetorand?", "How are mom and dad?", "چطورند = how are they"),
    ("خیلی ممنون", "kheili mamnoon", "thank you very much", "خیلی (very) + ممنون (thanks)"),
    ("بد نیستند", "bad nistand", "they're not bad", "بد (bad) + نیستند (are not)"),
]

# ============================================================
# SESSION 23 VOCABULARY
# ============================================================

session_23_vocab = [
    # Khosh compounds
    ("خوشتیپ", "khoshtip", "good-looking (men)", "خوش (pleasant) + تیپ (type/look)"),
    ("خوشگل", "khoshgel", "beautiful", "خوش (pleasant) + گل (flower)"),
    ("خوشمزه", "khoshmaze", "delicious", "خوش (pleasant) + مزه (taste)"),
    ("خورشت", "khorosht", "stew", "خ-و-ر-ش-ت"),
    ("خوشبخت", "khoshbakht", "fortunate, lucky", "خوش (pleasant) + بخت (fortune)"),
    
    # Letter ج vocab
    ("چای", "chāy", "tea", "چ-ا-ی"),
    ("چتر", "chatr", "umbrella", "چ-ت-ر"),
    ("پیچ", "pich", "screw, turn", "پ-ی-چ"),
    ("چنگال", "changāl", "fork, claw", "چ-ن-گ-ا-ل"),
    ("بچه", "bacheh", "child, kid", "ب-چ-ه"),
    ("چوپان", "choopān", "shepherd", "چ-و-پ-ا-ن"),
    
    # Food
    ("گوشت", "goosht", "meat", "گ-و-ش-ت"),
    ("سبزیجات", "sabzijāt", "vegetables", "سبزی (herb) + جات (plural)"),
    ("سبز", "sabz", "green", "س-ب-ز"),
    ("سبزی", "sabzi", "herb", "س-ب-ز-ی"),
    ("ماست", "māst", "yogurt", "م-ا-س-ت"),
    ("ماهی", "māhi", "fish", "م-ا-ه-ی"),
    ("عسل", "asal", "honey", "ع-س-ل"),
    ("دریا", "daryā", "sea", "د-ر-ی-ا"),
    ("غذای دریایی", "ghazā-ye daryāyi", "seafood", "غذا (food) + دریایی (of sea)"),
    ("گیاه", "giāh", "plant", "گ-ی-ا-ه"),
    ("غذای گیاهی", "ghazā-ye giāhi", "vegetarian food", "غذا (food) + گیاهی (plant-based)"),
    ("گیاه‌خوار", "giāh-khār", "vegetarian (person)", "گیاه (plant) + خوار (eater)"),
    
    # Drinks
    ("شراب", "sharāb", "wine", "ش-ر-ا-ب"),
    ("قرمز", "ghermez", "red", "ق-ر-م-ز"),
    ("سفید", "sefid", "white", "س-ف-ی-د"),
    ("آب جو", "āb-jo", "beer", "آب (water) + جو (barley)"),
    ("جو", "jo", "barley", "ج-و"),
    ("آب میوه", "āb miveh", "juice", "آب (water) + میوه (fruit)"),
    ("آب سیب", "āb sib", "apple juice", "آب (water) + سیب (apple)"),
    ("سیب", "sib", "apple", "س-ی-ب"),
    ("دم‌نوش", "dam-noosh", "herbal tea", "د-م-ن-و-ش"),
    ("چای سبز", "chāy-e sabz", "green tea", "چای + سبز (green)"),
    ("چای سیاه", "chāy-e siāh", "black tea", "چای + سیاه (black)"),
    ("سیاه", "siāh", "black", "س-ی-ا-ه"),
    ("شربت", "sharbat", "syrup drink", "ش-ر-ب-ت"),
    ("نوشابه", "nooshābeh", "soda", "ن-و-ش-ا-ب-ه"),
    ("شکر", "shekar", "sugar", "ش-ک-ر"),
    ("قند", "ghand", "sugar cube", "ق-ن-د"),
    
    # Other
    ("شیر", "shir", "lion / milk", "ش-ی-ر"),
    ("خورشید", "khorshid", "sun", "خ-و-ر-ش-ی-د"),
    ("پرچم", "parcham", "flag", "پ-ر-چ-م"),
    ("مشروب", "mashroob", "alcohol", "م-ش-ر-و-ب"),
    ("مست", "mast", "drunk", "م-س-ت"),
    ("مستی", "masti", "drunkenness", "م-س-ت-ی"),
    
    # Quote vocabulary
    ("راه", "rāh", "path, way", "ر-ا-ه"),
    ("جهان", "jahān", "world", "ج-ه-ا-ن"),
    ("نور", "noor", "light", "ن-و-ر"),
    ("تاریکی", "tāriki", "darkness", "تاریک (dark) + ی"),
    ("پیروز", "pirooz", "victorious", "پ-ی-ر-و-ز"),
    ("پایان", "pāyān", "end", "پ-ا-ی-ا-ن"),
    ("شب", "shab", "night", "ش-ب"),
]

session_23_grammar = [
    # خوردن - positive
    ("می‌خورم", "mikhoram", "I eat/drink", "می + خور + م"),
    ("می‌خوری", "mikhori", "you eat/drink", "می + خور + ی"),
    ("می‌خوره", "mikhoreh", "he/she eats/drinks", "می + خور + ه"),
    ("می‌خوریم", "mikhorim", "we eat/drink", "می + خور + یم"),
    ("می‌خورید", "mikhorid", "you eat/drink (formal)", "می + خور + ید"),
    ("می‌خورند", "mikhorand", "they eat/drink", "می + خور + ند"),
    
    # خوردن - negative
    ("نمی‌خورم", "nemikhoram", "I don't eat/drink", "نمی + خور + م"),
    ("نمی‌خوری", "nemikhori", "you don't eat/drink", "نمی + خور + ی"),
    ("نمی‌خوره", "nemikhoreh", "he/she doesn't eat/drink", "نمی + خور + ه"),
    ("نمی‌خوریم", "nemikhorim", "we don't eat/drink", "نمی + خور + یم"),
    ("نمی‌خورید", "nemikhorid", "you don't eat/drink (formal)", "نمی + خور + ید"),
]

session_23_phrases = [
    ("من گوشت می‌خورم", "man goosht mikhoram", "I eat meat", "Subject + Object + Verb"),
    ("من ماهی نمی‌خورم", "man māhi nemikhoram", "I don't eat fish", "Subject + Object + Negative Verb"),
    ("بدون شکر لطفاً", "bedoon-e shekar lotfan", "without sugar please", "بدون (without) + شکر + لطفاً (please)"),
    ("نوش جان!", "noosh-e jān!", "Enjoy your meal!", "نوش (sweet) + جان (soul)"),
    ("به سلامتی!", "be salāmati!", "Cheers! (to health)", "به (to) + سلامتی (health)"),
    ("هر دو", "har do", "both", "هر (every) + دو (two)"),
    ("من هر دو رو دوست دارم", "man har do ro doost dāram", "I like both", "هر دو (both) + رو (object marker) + دوست دارم (I like)"),
    ("اون مسته", "oon masteh", "he/she is drunk", "اون (he/she) + مست (drunk) + ه (is)"),
    ("من مست نیستم", "man mast nistam", "I am not drunk", "من + مست + نیستم (am not)"),
    ("سبزی پلو با ماهی", "sabzi polo bā māhi", "herb rice with fish (Nowruz dish)", "سبزی + پلو + با (with) + ماهی"),
]

# ============================================================
# SESSIONS 24-25 VOCABULARY
# ============================================================

session_24_25_vocab = [
    # Imperative verbs
    ("برسون", "beresoon", "send! deliver! (imperative)", "imperative of رسوندن (resoondan)"),
    ("بگو", "begoo", "tell! say! (imperative)", "imperative of گفتن (goftan)"),
    ("بده", "bedeh", "give! (imperative)", "imperative of دادن (dādan)"),
    ("بکن", "bokon", "do! (imperative)", "imperative of کردن (kardan)"),
    ("نکن", "nakon", "don't! (negative imperative)", "نَ + کن"),
    ("بخون", "bekhoon", "read! (imperative)", "imperative of خوندن (khoondan)"),
    ("بخور", "bokhor", "eat! (imperative)", "imperative of خوردن (khordan)"),
    ("برو", "boro", "go! (imperative)", "imperative of رفتن (raftan)"),
    ("بشین", "beshin", "sit! sit down! (imperative)", "imperative of نشستن (neshastan)"),
    ("بفرمایید", "befarmāyid", "please (polite invitation)", "formal polite imperative"),

    # khāndan family
    ("خواندن", "khāndan / khoondan", "to read", "خ-و-ا-ن-د-ن"),
    ("درس خوندن", "dars khoondan", "to study", "درس (lesson) + خوندن (to read)"),
    ("آواز خواندن", "āvāz khāndan / khoondan", "to sing", "آواز (song/singing) + خواندن"),
    ("خواننده", "khānandeh", "singer", "خواندن + ـنده (agent suffix)"),
    ("کتابخونه", "ketābkhoone", "library", "کتاب (book) + خونه (house)"),

    # Busy / time
    ("شلوغ", "sholugh", "busy / crowded", "ش-ل-و-غ"),
    ("وقت", "vaght", "time", "و-ق-ت"),
    ("همیشه", "hamishe", "always", "ه-م-ی-ش-ه"),
    ("معمولاً", "mā'moolan", "usually", "م-ع-م-و-ل-ا"),
    ("هیچ‌وقت", "hich-vaght", "never", "هیچ (no/none) + وقت (time)"),
    ("بعضی وقت‌ها", "baazi vaght-hā", "sometimes", "بعضی (some) + وقت‌ها (times)"),
    ("بیشتر وقت‌ها", "bishtare vaght-hā", "most of the time, often", "بیشتر (more/most) + وقت‌ها"),

    # Quantifiers
    ("بعضی", "baazi", "some (of)", "ب-ع-ض-ی"),
    ("بیشتر", "bishtar-e", "most, the majority of", "ب-ی-ش-ت-ر"),

    # Pronunciation pairs
    ("باد", "bād", "wind", "ب-ا-د (long ā)"),
    ("بادی", "bādi", "windy", "باد (wind) + ی"),
    ("بعد", "ba'd", "then, after", "ب-ع-د (with glottal)"),
    ("بعد از ظهر", "ba'd az zohr", "afternoon", "بعد (after) + از (from) + ظهر (noon)"),
    ("بازی", "bāzi", "play, game", "ب-ا-ز-ی"),

    # Food - pickles
    ("خیارشور", "khiār-shoor", "gherkins, salt-pickled cucumbers", "خیار (cucumber) + شور (salty)"),
    ("خیار", "khiār", "cucumber", "خ-ی-ا-ر"),
    ("ترشی", "torshi", "sour pickles, vinegar-based pickled vegetables", "ت-ر-ش-ی"),

    # Love
    ("عشق", "eshgh", "love", "ع-ش-ق"),
    ("عشقم", "eshgham", "my love (endearment)", "عشق + م (my)"),
    ("عاشق", "āshegh", "lover, in love", "ع-ا-ش-ق"),
    ("آهنگ", "āhang", "song", "ا-ه-ن-گ"),
    ("سفر", "safar", "travel, trip", "س-ف-ر"),
    ("سفر کردن", "safar kardan", "to travel", "سفر (travel) + کردن (to do)"),
    ("شهر", "shahr", "city", "ش-ه-ر"),

    # Glossary / reading passage vocab
    ("دستشویی", "dastshooyi", "restroom", "دست (hand) + شویی (washing)"),
    ("سنتی", "sonnati", "traditional", "س-ن-ت-ی"),
    ("قدیمی", "ghadimi", "old (things, places)", "ق-د-ی-م-ی"),
    ("پیر", "pir", "old (people)", "پ-ی-ر"),
    ("دانشگاه", "dāneshgāh", "university", "دانش (knowledge) + گاه (place)"),
    ("ظرف", "zarf", "dish, plate", "ظ-ر-ف"),
    ("تمیز", "tamiz", "clean", "ت-م-ی-ز"),
    ("دسر", "desser", "dessert, pudding", "د-س-ر"),
    ("تازه", "tāzeh", "fresh", "ت-ا-ز-ه"),
    ("آماده", "āmādeh", "ready, prepared", "ا-م-ا-د-ه"),
    ("بادمجان", "bādemjān", "aubergine, eggplant", "ب-ا-د-م-ج-ا-ن"),
    ("خورشت بادمجان", "khorosht-e bādemjān", "aubergine stew", "خورشت (stew) + بادمجان"),
    ("آشپزخونه", "āshpaz-khooneh", "kitchen", "آشپز (cook) + خونه (house)"),
    ("آشپزی کردن", "āshpazi kardan", "to cook", "آشپزی (cooking) + کردن (to do)"),
    ("شیرینی", "shirini", "sweets, pastry", "شیرین (sweet) + ی"),
    ("زیبا", "zibā", "beautiful", "ز-ی-ب-ا"),
    ("مورد علاقه", "mored-e alāghe", "favourite", "مورد (case) + علاقه (interest)"),
    ("درس", "dars", "lesson", "د-ر-س"),
    ("عصر", "asr", "evening, late afternoon", "ع-ص-ر"),
    ("رستوران", "restorān", "restaurant", "ر-س-ت-و-ر-ا-ن"),
    ("چند تا", "chand tā", "a few, several", "چند (how many/some) + تا (counter)"),
]

session_24_25_grammar = [
    # Imperative formation
    ("بخند", "bekhand", "Laugh! (singular imperative)", "بِ + خند (present stem of خندیدن)"),
    ("بخندید", "bekhandid", "Laugh! (formal/plural imperative)", "بِ + خند + ید"),
    ("نخند", "nakhand", "Don't laugh! (negative imperative)", "نَ + خند"),
    ("بفرمایید بخورید", "befarmāyid bokhorid", "Please eat! (formal polite)", "بفرمایید + بخورید"),
    ("بفرمایید بشینید", "befarmāyid beshinid", "Please sit down! (formal polite)", "بفرمایید + بشینید"),
]

session_24_25_phrases = [
    # Salam beresoon
    ("سلام برسون!", "salām beresoon!", "Send my regards!", "سلام (regards) + برسون (send/deliver, imperative)"),
    ("به مریم سلام برسون!", "be Maryam salām beresoon!", "Say hi to Maryam!", "به (to) + مریم + سلام + برسون"),
    ("مامانم سلام میرسونه", "māmānam salām miresooneh", "My mom is sending regards", "مامانم + سلام + میرسونه (delivers, 3rd person)"),

    # Imperative with pronouns
    ("به من بگو", "be man begoo", "Tell me!", "به (to) + من (me) + بگو (tell)"),
    ("به اون بگو", "be oon begoo", "Tell her/him!", "به (to) + اون (her/him) + بگو (tell)"),
    ("به من بده", "be man bedeh", "Give me!", "به (to) + من (me) + بده (give)"),
    ("این رو بخون", "in ro bekhoon", "Read this!", "این (this) + رو (object marker) + بخون (read)"),

    # Sholugh - busy
    ("سرم شلوغه", "saram sholugh-e", "I'm busy", "سرم (my head) + شلوغه (is busy)"),
    ("امروز سرت شلوغه؟", "emrooz saret sholugh-e?", "Are you busy today?", "امروز (today) + سرت (your head) + شلوغه"),

    # Time
    ("این هفته وقت ندارم", "in hafte vaght nadāram", "I don't have time this week", "این هفته + وقت (time) + ندارم (don't have)"),
    ("امروز وقت دارم", "emrooz vaght dāram", "I have time today", "امروز + وقت + دارم (have)"),

    # Frequency adverb sentences
    ("من همیشه بستنی سفارش میدم", "man hamishe bastani sefāresh midam", "I always order ice cream", "همیشه (always) + سفارش میدم (I order)"),
    ("اون همیشه میخنده", "oon hamishe mikhandeh", "He/She always laughs", "اون + همیشه + میخنده (laughs)"),
    ("من هیچ‌وقت به سگم بیسکویت نمیدم", "man hich-vaght be sagam biscuit nemidam", "I never give my dog biscuits", "هیچ‌وقت (never) + نمیدم (don't give)"),

    # Love
    ("من عاشقت هستم", "man āsheghet hastam", "I am in love with you / I love you", "من + عاشقت (in love with you) + هستم (am)"),
    ("من عاشق این آهنگ هستم", "man āshegh-e in āhang hastam", "I love this song", "عاشق (in love) + این آهنگ (this song)"),
    ("من عاشق این شهر هستم", "man āshegh-e in shahr hastam", "I'm in love with this city", "عاشق + این شهر (this city)"),
    ("مامانم عاشق سفر کردن هست", "māmānam āshegh-e safar kardan hast", "My mom loves traveling", "عاشق + سفر کردن (traveling)"),
    ("اون عاشق شکلات هست", "oon āshegh-e shokolāt hast", "He/She loves chocolate", "عاشق + شکلات"),

    # Pickles
    ("مامان‌بزرگش ترشی درست میکنه", "māmān-bozorgesh torshi dorost mikoneh", "His/her grandma makes pickles", "مامان‌بزرگش + ترشی + درست میکنه"),

    # Reading passage sentences
    ("من عاشق خانواده‌ام هستم", "man āshegh-e khoonevāde-am hastam", "I love my family", "عاشق + خانواده‌ام (my family)"),
    ("ما در شهر یزد زندگی میکنیم", "mā dar shahr-e Yazd zendegi mikonim", "We live in the city of Yazd", "زندگی میکنیم (we live)"),
    ("ما همیشه در رستورانمون غذای سنتی درست میکنیم", "mā hamishe dar restorān-emoon ghazā-ye sonnati dorost mikonim", "We always make traditional food in our restaurant", "رستورانمون = our restaurant (Tehran)"),
    ("من در دانشگاه درس میخونم", "man dar dāneshgāh dars mikhoonam", "I study at university", "درس میخونم (I study)"),
    ("من هیچ‌وقت آشپزی نمیکنم", "man hichvaght āshpazi nemikonam", "I never cook", "هیچ‌وقت + آشپزی نمیکنم"),
    ("رستوران امروز خیلی شلوغ هست", "restorān emrooz kheili sholugh hast", "The restaurant is very busy today", "شلوغ (busy/crowded)"),
    ("خورشت بادمجون خورشت مورد علاقم هست", "khorosht-e bādemjoon khorosht-e mored-e alāgham hast", "Aubergine stew is my favourite stew", "مورد علاقم (my favourite)"),
]

# ============================================================
# PERSIAN ALPHABET - ALL FORMS
# ============================================================

# (Letter name, Pinglish sound, Isolated, Initial, Medial, Final, Notes)
# Some letters don't connect to the left, so they only have 2 forms (isolated/final)

persian_alphabet = [
    # Connecting letters (4 forms)
    ("alef", "ā / a", "ا", "ا", "ـا", "ـا", "Long 'a' or silent carrier"),
    ("be", "b", "ب", "بـ", "ـبـ", "ـب", "Like English 'b'"),
    ("pe", "p", "پ", "پـ", "ـپـ", "ـپ", "Like English 'p' (Persian only)"),
    ("te", "t", "ت", "تـ", "ـتـ", "ـت", "Like English 't'"),
    ("se", "s", "ث", "ثـ", "ـثـ", "ـث", "Like 's' (Arabic loan words)"),
    ("jim", "j", "ج", "جـ", "ـجـ", "ـج", "Like 'j' in 'judge'"),
    ("che", "ch", "چ", "چـ", "ـچـ", "ـچ", "Like 'ch' in 'chair' (Persian only)"),
    ("he (ḥā)", "h", "ح", "حـ", "ـحـ", "ـح", "Breathy 'h'"),
    ("khe", "kh", "خ", "خـ", "ـخـ", "ـخ", "Like 'ch' in Scottish 'loch'"),
    ("sin", "s", "س", "سـ", "ـسـ", "ـس", "Like English 's'"),
    ("shin", "sh", "ش", "شـ", "ـشـ", "ـش", "Like 'sh' in 'ship'"),
    ("sād", "s", "ص", "صـ", "ـصـ", "ـص", "Emphatic 's' (Arabic)"),
    ("zād", "z", "ض", "ضـ", "ـضـ", "ـض", "Emphatic 'z' (Arabic)"),
    ("tā", "t", "ط", "طـ", "ـطـ", "ـط", "Emphatic 't' (Arabic)"),
    ("zā", "z", "ظ", "ظـ", "ـظـ", "ـظ", "Emphatic 'z' (Arabic)"),
    ("eyn", "'", "ع", "عـ", "ـعـ", "ـع", "Glottal sound"),
    ("gheyn", "gh", "غ", "غـ", "ـغـ", "ـغ", "Guttural 'g'"),
    ("fe", "f", "ف", "فـ", "ـفـ", "ـف", "Like English 'f'"),
    ("qāf", "gh / q", "ق", "قـ", "ـقـ", "ـق", "Deep guttural (often = غ in Persian)"),
    ("kāf", "k", "ک", "کـ", "ـکـ", "ـک", "Like English 'k'"),
    ("gāf", "g", "گ", "گـ", "ـگـ", "ـگ", "Like 'g' in 'go' (Persian only)"),
    ("lām", "l", "ل", "لـ", "ـلـ", "ـل", "Like English 'l'"),
    ("mim", "m", "م", "مـ", "ـمـ", "ـم", "Like English 'm'"),
    ("nun", "n", "ن", "نـ", "ـنـ", "ـن", "Like English 'n'"),
    ("he", "h / e", "ه", "هـ", "ـهـ", "ـه", "Like 'h' or silent 'e' at end"),
    ("ye", "y / i", "ی", "یـ", "ـیـ", "ـی", "Like 'y' or long 'ee'"),
    
    # Non-connecting letters (only connect to right, 2 forms shown as isolated + final)
    ("dāl", "d", "د", "د", "ـد", "ـد", "Like English 'd' (doesn't connect left)"),
    ("zāl", "z", "ذ", "ذ", "ـذ", "ـذ", "Like 'z' (doesn't connect left)"),
    ("re", "r", "ر", "ر", "ـر", "ـر", "Rolled 'r' (doesn't connect left)"),
    ("ze", "z", "ز", "ز", "ـز", "ـز", "Like English 'z' (doesn't connect left)"),
    ("zhe", "zh", "ژ", "ژ", "ـژ", "ـژ", "Like 's' in 'measure' (Persian only, doesn't connect)"),
    ("vāv", "v / oo / o", "و", "و", "ـو", "ـو", "v, oo, or o sound (doesn't connect left)"),
]

# ============================================================
# GENERATE CARDS
# ============================================================

def make_front_farsi(farsi):
    """Card front: Farsi word ONLY (no hints - tests reading)"""
    return f'<div class="farsi">{farsi}</div>'

def make_back_vocab(farsi, pinglish, english, breakdown):
    """Card back: full info"""
    return f'''<div class="meaning"><strong>{english}</strong></div>
<div class="pinglish">{pinglish}</div>
<div class="breakdown">Letters: {breakdown}</div>'''

def make_front_english(english):
    """Card front: English meaning ONLY"""
    return f'<div class="meaning">{english}</div>'

def make_back_english(farsi, pinglish, breakdown):
    """Card back: Farsi answer"""
    return f'''<div class="farsi">{farsi}</div>
<div class="pinglish">{pinglish}</div>
<div class="breakdown">Letters: {breakdown}</div>'''

# Add Session 22 vocabulary (Farsi → English)
for farsi, pinglish, english, breakdown in session_22_vocab:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session22', 'vocabulary', 'farsi-to-english']
    )
    deck.add_note(note)

# Add Session 22 vocabulary (English → Farsi)
for farsi, pinglish, english, breakdown in session_22_vocab:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_english(english),
            make_back_english(farsi, pinglish, breakdown)
        ],
        tags=['session22', 'vocabulary', 'english-to-farsi']
    )
    deck.add_note(note)

# Add Session 22 grammar
for farsi, pinglish, english, breakdown in session_22_grammar:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session22', 'grammar', 'to-be-verb']
    )
    deck.add_note(note)

# Add Session 22 phrases
for farsi, pinglish, english, breakdown in session_22_phrases:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session22', 'phrases']
    )
    deck.add_note(note)

# Add Session 23 vocabulary (Farsi → English)
for farsi, pinglish, english, breakdown in session_23_vocab:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session23', 'vocabulary', 'farsi-to-english']
    )
    deck.add_note(note)

# Add Session 23 vocabulary (English → Farsi)
for farsi, pinglish, english, breakdown in session_23_vocab:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_english(english),
            make_back_english(farsi, pinglish, breakdown)
        ],
        tags=['session23', 'vocabulary', 'english-to-farsi']
    )
    deck.add_note(note)

# Add Session 23 grammar (verb conjugation)
for farsi, pinglish, english, breakdown in session_23_grammar:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session23', 'grammar', 'khordan-verb']
    )
    deck.add_note(note)

# Add Session 23 phrases
for farsi, pinglish, english, breakdown in session_23_phrases:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session23', 'phrases']
    )
    deck.add_note(note)

# Add Sessions 24-25 vocabulary (Farsi → English)
for farsi, pinglish, english, breakdown in session_24_25_vocab:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session24-25', 'vocabulary', 'farsi-to-english']
    )
    deck.add_note(note)

# Add Sessions 24-25 vocabulary (English → Farsi)
for farsi, pinglish, english, breakdown in session_24_25_vocab:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_english(english),
            make_back_english(farsi, pinglish, breakdown)
        ],
        tags=['session24-25', 'vocabulary', 'english-to-farsi']
    )
    deck.add_note(note)

# Add Sessions 24-25 grammar
for farsi, pinglish, english, breakdown in session_24_25_grammar:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session24-25', 'grammar', 'imperative']
    )
    deck.add_note(note)

# Add Sessions 24-25 phrases (Farsi → English)
for farsi, pinglish, english, breakdown in session_24_25_phrases:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_front_farsi(farsi),
            make_back_vocab(farsi, pinglish, english, breakdown)
        ],
        tags=['session24-25', 'phrases']
    )
    deck.add_note(note)

# ============================================================
# ADD ALPHABET CARDS
# ============================================================

def make_letter_front(isolated_form, name):
    """Card front: Just the letter in isolated form"""
    return f'<div class="farsi" style="font-size: 72px;">{isolated_form}</div>'

def make_letter_back(name, pinglish, isolated, initial, medial, final, notes):
    """Card back: All forms and info"""
    return f'''<div class="meaning"><strong>{name}</strong></div>
<div class="pinglish">Sound: {pinglish}</div>
<hr>
<div style="font-size: 32px; direction: rtl; margin: 15px 0;">
<table style="margin: 0 auto; font-size: 28px;">
<tr><td>Isolated</td><td>Initial</td><td>Medial</td><td>Final</td></tr>
<tr style="font-size: 36px;"><td>{isolated}</td><td>{initial}</td><td>{medial}</td><td>{final}</td></tr>
</table>
</div>
<div class="breakdown">{notes}</div>'''

def make_forms_front(isolated, initial, medial, final):
    """Card front: Show all forms, ask for letter name"""
    return f'''<div style="font-size: 28px; direction: rtl; margin: 15px 0;">
<table style="margin: 0 auto; font-size: 36px;">
<tr><td>{isolated}</td><td>{initial}</td><td>{medial}</td><td>{final}</td></tr>
</table>
</div>
<div class="pinglish">What letter is this?</div>'''

def make_forms_back(name, pinglish, notes):
    """Card back: Letter name and sound"""
    return f'''<div class="meaning"><strong>{name}</strong></div>
<div class="pinglish">Sound: {pinglish}</div>
<div class="breakdown">{notes}</div>'''

# Card Type 1: See isolated letter → name + sound + all forms
for name, pinglish, isolated, initial, medial, final, notes in persian_alphabet:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_letter_front(isolated, name),
            make_letter_back(name, pinglish, isolated, initial, medial, final, notes)
        ],
        tags=['alphabet', 'letter-recognition']
    )
    deck.add_note(note)

# Card Type 2: See all forms → identify the letter
for name, pinglish, isolated, initial, medial, final, notes in persian_alphabet:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            make_forms_front(isolated, initial, medial, final),
            make_forms_back(name, pinglish, notes)
        ],
        tags=['alphabet', 'forms-recognition']
    )
    deck.add_note(note)

# Card Type 3: Letter name → write the letter (all forms)
for name, pinglish, isolated, initial, medial, final, notes in persian_alphabet:
    note = genanki.Note(
        model=farsi_model,
        fields=[
            f'<div class="meaning">Write the letter: <strong>{name}</strong></div><div class="pinglish">Sound: {pinglish}</div>',
            f'''<div style="font-size: 32px; direction: rtl; margin: 15px 0;">
<table style="margin: 0 auto; font-size: 36px;">
<tr><td>Isolated</td><td>Initial</td><td>Medial</td><td>Final</td></tr>
<tr style="font-size: 48px;"><td>{isolated}</td><td>{initial}</td><td>{medial}</td><td>{final}</td></tr>
</table>
</div>
<div class="breakdown">{notes}</div>'''
        ],
        tags=['alphabet', 'writing-practice']
    )
    deck.add_note(note)

# ============================================================
# SAVE THE DECK
# ============================================================

output_file = '/Users/mcgourty.alex/code/farsi/farsi_cursor_agent.apkg'
genanki.Package(deck).write_to_file(output_file)

# Count cards
total_vocab = len(session_22_vocab) + len(session_23_vocab) + len(session_24_25_vocab)
total_grammar = len(session_22_grammar) + len(session_23_grammar) + len(session_24_25_grammar)
total_phrases = len(session_22_phrases) + len(session_23_phrases) + len(session_24_25_phrases)
total_alphabet = len(persian_alphabet) * 3  # 3 card types per letter

print(f"✓ Created: {output_file}")
print(f"")
print(f"Card counts:")
print(f"  Session 22 vocabulary: {len(session_22_vocab)} × 2 directions = {len(session_22_vocab) * 2} cards")
print(f"  Session 22 grammar:    {len(session_22_grammar)} cards")
print(f"  Session 22 phrases:    {len(session_22_phrases)} cards")
print(f"  Session 23 vocabulary: {len(session_23_vocab)} × 2 directions = {len(session_23_vocab) * 2} cards")
print(f"  Session 23 grammar:    {len(session_23_grammar)} cards")
print(f"  Session 23 phrases:    {len(session_23_phrases)} cards")
print(f"  Sessions 24-25 vocabulary: {len(session_24_25_vocab)} × 2 directions = {len(session_24_25_vocab) * 2} cards")
print(f"  Sessions 24-25 grammar:    {len(session_24_25_grammar)} cards")
print(f"  Sessions 24-25 phrases:    {len(session_24_25_phrases)} cards")
print(f"  Alphabet:              {len(persian_alphabet)} letters × 3 types = {total_alphabet} cards")
print(f"")
print(f"  TOTAL: {total_vocab * 2 + total_grammar + total_phrases + total_alphabet} cards")
print(f"")
print(f"→ Double-click the .apkg file to import into Anki")
