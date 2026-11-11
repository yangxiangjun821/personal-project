/* One shared, lazily loaded record for every animal, used by the species cards (animal-list.js) and
   the detail page (animal-detail.js). Built from data the site already has:
     project.html                          name, scientific name, IUCN category, range, signature, threats
     images/animal-photo-credits.json      photographer, licence and source page of each photograph
     images/animals/animal-locations.json  one representative place (for the small map)
     images/animals/animal-details.json    hand-checked facts (see its _readme). Anything missing there
                                           is shown to readers as "No reliable data yet", never guessed.
     images/animals/animal-details-en.json the same facts in English, shown when the site is in English */
window.animalData = (() => {
    'use strict';
    const IUCN = {
        critical: { abbr: 'CR', en: 'Critically endangered' },
        endangered: { abbr: 'EN', en: 'Endangered' },
        vulnerable: { abbr: 'VU', en: 'Vulnerable' }
    };
    const ORDER = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX'];
    // Population supplements for records whose original detail file had no population block.
    // Each number keeps its scope and date so a regional survey is never presented as a global census.
    const POPULATION_SUPPLEMENT = {
        'Amazon river dolphin': {
            zh: { estimate: '暂无可靠的全分布区总量；一项保护机构估计约 30,000–45,000 只', scope: '整个亚马孙河和奥里诺科河流域；估计不等同于统一普查', year: 'IUCN 2018 年评估；数量估计见 2025 年报道', trend: '下降；长期监测区的粉红河豚数量在数十年间下降约 52%' },
            en: { estimate: 'No reliable range-wide total; one conservation estimate suggests about 30,000–45,000', scope: 'Amazon and Orinoco basins; this is not a single coordinated census', year: 'IUCN assessment 2018; abundance estimate reported in 2025', trend: 'Decreasing; long-term monitoring sites recorded an approximately 52% decline over recent decades' },
            source: ['Amazon river dolphin monitoring summary (Marine Mammal Commission)', 'https://www.mmc.gov/sections/species-profile/']
        },
        'Antarctic blue whale': {
            zh: { estimate: '2018/19 年估计 1,817 只（95% 置信区间：714–4,624）', scope: '环南极种群；基于个体照片重捕模型', year: '2018/19 调查年度，研究发表于 2024 年', trend: '恢复中；模型估计年增长率约 10%–11%，但仍远低于捕鲸前水平' },
            en: { estimate: '1,817 whales in 2018/19 (95% CI: 714–4,624)', scope: 'Circumpolar Antarctic population, estimated with photo-identification capture–recapture models', year: '2018/19 study year; published 2024', trend: 'Recovering; modelled annual growth was about 10%–11%, but abundance remains far below pre-whaling levels' },
            source: ['Australian Antarctic Program: Antarctic blue whale abundance', 'https://www.antarctica.gov.au/science/publications/southern-ocean-ecosystems/17210/']
        },
        'Axolotl': {
            zh: { estimate: '野外约 50–1,000 只成熟个体', scope: '仅限墨西哥城霍奇米尔科水系的野生种群', year: 'IUCN 2020 年评估', trend: '持续下降；野外密度从 1998 年约每平方千米 6,000 只降至 2014 年约 36 只' },
            en: { estimate: 'Approximately 50–1,000 mature individuals in the wild', scope: 'Wild population in the Xochimilco wetland system, Mexico City', year: 'IUCN assessment 2020', trend: 'Decreasing; surveyed density fell from about 6,000/km² in 1998 to about 36/km² in 2014' },
            source: ['Conservation International: axolotl conservation', 'https://www.conservation.org/learning/axolotl-conservation']
        },
        'Aye-aye': {
            zh: { estimate: '暂无可靠的全岛种群估计', scope: '马达加斯加现存分布区；需要系统性普查', year: 'IUCN 2020 年评估', trend: '下降' },
            en: { estimate: 'No reliable island-wide population estimate is available', scope: 'Remaining range in Madagascar; a systematic census is still needed', year: 'IUCN assessment 2020', trend: 'Decreasing' },
            source: ['IUCN Amazing Species: Aye-aye', 'https://nc.iucnredlist.org/redlist/amazing-species/daubentonia-madagascariensis/pdfs/original/daubentonia-madagascariensis.pdf']
        },
        'Blue whale': {
            zh: { estimate: '约 5,000–15,000 只成熟个体；总数约 10,000–25,000 只', scope: '全球所有蓝鲸亚种合计', year: 'IUCN 2018 年评估所用估计', trend: '全球总体增加，但不同海区恢复程度不一' },
            en: { estimate: 'Approximately 5,000–15,000 mature individuals; about 10,000–25,000 in total', scope: 'All blue whale subspecies worldwide', year: 'Estimate used by the 2018 IUCN assessment', trend: 'Increasing globally, although recovery differs among ocean populations' },
            source: ['NOAA Fisheries: Blue whale population status', 'https://www.fisheries.noaa.gov/species/blue-whale']
        },
        'Cross River gorilla': {
            zh: { estimate: '约 250–280 只', scope: '尼日利亚—喀麦隆边境约 10–13 个彼此分隔的群体', year: 'IUCN 2016 年评估所用范围估计', trend: '下降；小种群且栖息地破碎' },
            en: { estimate: 'Approximately 250–280 individuals', scope: 'About 10–13 fragmented groups along the Nigeria–Cameroon border', year: 'Range estimate used around the 2016 IUCN assessment', trend: 'Decreasing; the population is small and fragmented' },
            source: ['Cross River gorilla range and population', 'https://crossrivergorilla.org/range-population/']
        },
        'Egyptian vulture': {
            zh: { estimate: '约 12,400–36,000 只成熟个体（总数约 18,600–54,000 只）', scope: '全球种群', year: '2020 年估计，IUCN 2021 年评估', trend: '下降' },
            en: { estimate: 'Approximately 12,400–36,000 mature individuals (about 18,600–54,000 total)', scope: 'Global population', year: '2020 estimate; IUCN assessment 2021', trend: 'Decreasing' },
            source: ['BirdLife DataZone: Egyptian vulture', 'https://datazone.birdlife.org/species/factsheet/egyptian-vulture-neophron-percnopterus']
        },
        'European eel': {
            zh: { estimate: '无法用单一总量表示；评估主要依赖玻璃鳗和黄鳗补充量指数', scope: '欧洲及北非分布区的单一种群', year: '2024 年 ICES 招募指数', trend: '仍处低位；北海玻璃鳗补充量约为 1960–1979 年基线的 1.1%，欧洲其他地区约为 7.2%' },
            en: { estimate: 'No meaningful single total is available; status is assessed mainly from glass-eel and yellow-eel recruitment indices', scope: 'Single stock across its European and North African range', year: '2024 ICES recruitment indices', trend: 'Still severely depleted; glass-eel recruitment was about 1.1% of the 1960–1979 baseline in the North Sea and 7.2% elsewhere in Europe' },
            source: ['European Commission: European eel status', 'https://oceans-and-fisheries.ec.europa.eu/ocean-health/eel_en']
        },
        'Golden poison frog': {
            zh: { estimate: '暂无可靠的全球数量估计', scope: '哥伦比亚太平洋沿岸的狭小分布区', year: 'IUCN 2017 年评估', trend: '下降' },
            en: { estimate: 'No reliable global abundance estimate is available', scope: 'Restricted range on Colombia’s Pacific coast', year: 'IUCN assessment 2017', trend: 'Decreasing' }
        },
        'Great hammerhead': {
            zh: { estimate: '暂无可靠的全球总量估计', scope: '全球热带和暖温带海域', year: 'IUCN 2019 年评估', trend: '快速下降；多个海区的长期数据表明种群已严重减少' },
            en: { estimate: 'No reliable global population total is available', scope: 'Tropical and warm-temperate waters worldwide', year: 'IUCN assessment 2019', trend: 'Rapidly decreasing; long-term datasets show severe depletion in multiple regions' },
            source: ['Marine Megafauna Foundation: Great hammerhead', 'https://marinemegafauna.org/species/great-hammerhead']
        },
        'Greater bamboo lemur': {
            zh: { estimate: '约 1,500 只', scope: '马达加斯加已知野外种群；各地点调查覆盖程度不同', year: '约 2020 年的保护项目估计', trend: '下降，但部分重点保护地点的群体有所增长' },
            en: { estimate: 'Approximately 1,500 individuals', scope: 'Known wild populations in Madagascar; survey coverage varies by site', year: 'Conservation-programme estimate around 2020', trend: 'Decreasing overall, although some intensively protected local populations have grown' },
            source: ['Helpsimus: Greater bamboo lemur', 'https://www.helpsimus.org/en/greater-bamboo-lemur/']
        },
        'Harpy eagle': {
            zh: { estimate: '约 100,000–250,000 只成熟个体', scope: '中美洲和南美洲的全球种群', year: 'IUCN 2021 年评估', trend: '下降' },
            en: { estimate: 'Approximately 100,000–250,000 mature individuals', scope: 'Global population across Central and South America', year: 'IUCN assessment 2021', trend: 'Decreasing' },
            source: ['IUCN Red List: Harpy eagle 2021', 'https://doi.org/10.2305/IUCN.UK.2021-3.RLTS.T22695998A197957213.en']
        },
        'Hawksbill turtle': {
            zh: { estimate: '暂无可靠的当前全球总量；通常以各繁殖地的产卵雌龟数监测', scope: '全球多个彼此分隔的海洋亚种群', year: 'IUCN 全球评估 2008 年', trend: '长期下降；不同地区变化不一' },
            en: { estimate: 'No reliable current global total; populations are usually monitored through nesting-female counts at separate rookeries', scope: 'Multiple ocean subpopulations worldwide', year: 'Global IUCN assessment 2008', trend: 'Long-term decline, with regional variation' }
        },
        'Helmeted hornbill': {
            zh: { estimate: '暂无可靠的全球数量估计', scope: '东南亚现存森林分布区', year: 'IUCN 2020 年评估', trend: '下降；盗猎盔突和森林丧失仍在持续' },
            en: { estimate: 'No reliable global abundance estimate is available', scope: 'Remaining forest range in Southeast Asia', year: 'IUCN assessment 2020', trend: 'Decreasing; casque poaching and forest loss continue' },
            source: ['IUCN Hornbill Specialist Group: Helmeted hornbill', 'https://iucnhornbills.org/helmeted-hornbill/']
        },
        'Koala': {
            zh: { estimate: '受联邦威胁名录覆盖的东部种群约 398,000–569,000 只', scope: '昆士兰、新南威尔士和澳大利亚首都领地；不代表全澳总量', year: '澳大利亚国家考拉监测计划 2025 年模型', trend: '新估计主要反映调查改善，不能证明种群增长；受威胁地区仍在收缩' },
            en: { estimate: 'Approximately 398,000–569,000 in the federally listed eastern population', scope: 'Queensland, New South Wales and the Australian Capital Territory; not an all-Australia total', year: '2025 National Koala Monitoring Program model', trend: 'The higher estimate mainly reflects improved surveys, not demonstrated growth; threatened populations continue to contract' },
            source: ['Australian Government: 2025 koala population estimate', 'https://www.dcceew.gov.au/environment/biodiversity/threatened/species/koalas/national-koala-monitoring-program']
        },
        'Komodo dragon': {
            zh: { estimate: '科莫多国家公园约 3,270 ± 371 只', scope: '科莫多国家公园五座岛屿；不含弗洛勒斯岛所有分布点', year: '2024 年监测', trend: '2018–2024 年在国家公园内总体稳定至小幅增加' },
            en: { estimate: 'Approximately 3,270 ± 371 in Komodo National Park', scope: 'Five islands in Komodo National Park; not every population on Flores', year: '2024 monitoring', trend: 'Stable to slightly increasing within the park from 2018 to 2024' },
            source: ['Indonesia KSDAE: Komodo monitoring 2024', 'https://ksdae.kehutanan.go.id/in-flores/program/priority-species-conservation/']
        },
        'Largetooth sawfish': {
            zh: { estimate: '暂无可靠的全球总量估计', scope: '残存的海岸、河口和大河种群', year: 'IUCN 2022 年评估', trend: '下降；多数历史分布区已消失或极度稀少' },
            en: { estimate: 'No reliable global population total is available', scope: 'Remaining coastal, estuarine and large-river populations', year: 'IUCN assessment 2022', trend: 'Decreasing; the species is absent or extremely rare across much of its former range' }
        },
        'Leatherback turtle': {
            zh: { estimate: '每年约 26,000–43,000 只雌龟在全球各繁殖地筑巢', scope: '全球年度产卵雌龟估计；不是所有年龄和性别的总数', year: 'IUCN 2013 年评估引用的近期估计', trend: '全球趋势因亚种群而异；太平洋部分种群严重下降' },
            en: { estimate: 'Approximately 26,000–43,000 females nest worldwide each year', scope: 'Annual global nesting-female estimate, not a total of all ages and sexes', year: 'Recent estimate cited around the 2013 IUCN assessment', trend: 'Trends differ by subpopulation; several Pacific populations have declined severely' },
            source: ['Leatherback global nesting estimate', 'https://www.canada.ca/en/environment-climate-change/services/species-risk-public-registry/recovery-strategies/leatherback-turtles/chapter-2b.html']
        },
        'Loggerhead turtle': {
            zh: { estimate: '暂无可比的单一全球总量；通常分别统计各繁殖种群的产卵雌龟和巢数', scope: '全球多个独立管理单元', year: 'IUCN 全球评估 2017 年', trend: '不同亚种群有增有减，不能用一个全球趋势概括' },
            en: { estimate: 'No single comparable global total; nesting females and nests are counted separately for each breeding population', scope: 'Multiple independently managed populations worldwide', year: 'Global IUCN assessment 2017', trend: 'Mixed among subpopulations; no single global trend is representative' }
        },
        'Marine iguana': {
            zh: { estimate: '约 19,800–210,000 只', scope: '加拉帕戈斯群岛全部亚种；不同岛屿估计差异很大', year: '当前保护资料汇总', trend: '下降；厄尔尼诺事件可使部分岛屿种群短期减少多达约 90%' },
            en: { estimate: 'Approximately 19,800–210,000 individuals', scope: 'All subspecies across the Galápagos; estimates vary greatly among islands', year: 'Current conservation summary', trend: 'Decreasing; El Niño events can cause short-term losses of up to about 90% on some islands' },
            source: ['International Iguana Foundation: Marine iguana', 'https://www.iguanafoundation.org/what-we-support/galapagos-iguanas/galapagos-marine-iguana/']
        },
        'Monarch butterfly': {
            zh: { estimate: '无法用稳定的全球个体总数表示；迁徙种群通常以越冬地占地面积监测', scope: '北美东部和西部迁徙种群分别监测', year: '年度越冬监测，数量波动很大', trend: '长期下降，但年度间波动显著' },
            en: { estimate: 'No stable global individual total is available; migratory populations are usually monitored by the area occupied at wintering sites', scope: 'Eastern and western North American migratory populations are monitored separately', year: 'Annual winter counts; abundance fluctuates strongly', trend: 'Long-term decline with large year-to-year variation' }
        },
        'Oceanic whitetip shark': {
            zh: { estimate: '暂无可靠的全球总量估计', scope: '全球热带外海种群', year: 'IUCN 2019 年评估；NOAA 后续状态复核', trend: '严重下降；例如墨西哥湾商业捕捞数据估计下降约 88%' },
            en: { estimate: 'No reliable global abundance estimate is available', scope: 'Tropical open-ocean populations worldwide', year: 'IUCN assessment 2019 with later NOAA status reviews', trend: 'Severely decreasing; commercial-fishery data indicate an approximately 88% decline in the Gulf of Mexico' },
            source: ['NOAA Fisheries: Oceanic whitetip shark resources', 'https://www.fisheries.noaa.gov/species/oceanic-whitetip-shark/resources']
        },
        'Okapi': {
            zh: { estimate: '暂无可靠的当前总量；2008 年曾粗略估计 10,000–35,000 只', scope: '刚果民主共和国现存分布区；粪便样线估计不确定性很高', year: 'IUCN 2015 年评估', trend: '下降；三代约 24 年间估计减少超过 50%' },
            en: { estimate: 'No reliable current total; a rough 2008 estimate suggested 10,000–35,000', scope: 'Remaining range in the Democratic Republic of the Congo; dung-transect estimates have high uncertainty', year: 'IUCN assessment 2015', trend: 'Decreasing; estimated loss exceeded 50% over three generations, about 24 years' },
            source: ['IUCN Okapi conservation strategy', 'https://portals.iucn.org/library/efiles/documents/2015-046.pdf']
        },
        'Proboscis monkey': {
            zh: { estimate: '暂无可靠的全球总量估计', scope: '婆罗洲沿海、河岸和红树林的分散种群', year: 'IUCN 2021 年评估', trend: '下降；截至 2008 年前的约 36–40 年间估计减少超过 50%' },
            en: { estimate: 'No reliable global population total is available', scope: 'Fragmented coastal, riverine and mangrove populations on Borneo', year: 'IUCN assessment 2021', trend: 'Decreasing; estimated to have fallen by more than 50% over roughly 36–40 years up to 2008' },
            source: ['IUCN Red List: Proboscis monkey', 'https://doi.org/10.2305/IUCN.UK.2021-1.RLTS.T14352A195372486.en']
        },
        'Radiated tortoise': {
            zh: { estimate: '暂无经过验证的全球野外总量估计', scope: '马达加斯加南部残存分布区', year: 'IUCN 2008 年评估；后续资料仍缺少全范围普查', trend: '快速下降；已从约 65% 的历史栖息地消失' },
            en: { estimate: 'No verified global wild-population estimate is available', scope: 'Remaining range in southern Madagascar', year: 'IUCN assessment 2008; later sources still lack a range-wide census', trend: 'Rapidly decreasing; the species has disappeared from about 65% of its former habitat' }
        },
        'Red panda': {
            zh: { estimate: '野外少于 10,000 只成熟个体', scope: '喜马拉雅东部和中国西南部全球种群', year: 'IUCN 2015 年评估', trend: '下降' },
            en: { estimate: 'Fewer than 10,000 mature individuals in the wild', scope: 'Global population in the Eastern Himalayas and south-western China', year: 'IUCN assessment 2015', trend: 'Decreasing' },
            source: ['WWF: Red panda population', 'https://www.worldwildlife.org/species/red-panda/']
        },
        'Regent honeyeater': {
            zh: { estimate: '野外约 200–400 只', scope: '澳大利亚东南部现存野生种群', year: '新南威尔士州政府 2026 年资料', trend: '下降；每年自然繁殖数量很少，保护放归对种群十分重要' },
            en: { estimate: 'Approximately 200–400 birds in the wild', scope: 'Remaining wild population in south-eastern Australia', year: 'New South Wales Government information, 2026', trend: 'Decreasing; natural recruitment is low and conservation releases are important' },
            source: ['NSW Government: Regent honeyeater conservation', 'https://www.nsw.gov.au/departments-and-agencies/local-land-services/projects/nht-regent-honeyeater-conservation']
        },
        'Rusty patched bumble bee': {
            zh: { estimate: '无法可靠换算为全球个体总数', scope: '美国和加拿大残存分布点；以出现地点和占域范围监测', year: '美国 2016 年物种状态评估，2017 年列入濒危名录', trend: '急剧下降；自 20 世纪 90 年代末以来估计减少约 87%' },
            en: { estimate: 'No reliable range-wide individual total can be calculated', scope: 'Remaining sites in the United States and Canada; monitored through occupancy and occurrence records', year: 'U.S. species status assessment 2016; listed as endangered in 2017', trend: 'Steep decline; estimated loss of about 87% since the late 1990s' },
            source: ['U.S. Fish & Wildlife Service: Rusty patched bumble bee', 'https://www.fws.gov/species/rusty-patched-bumble-bee-bombus-affinis']
        },
        'Siamese crocodile': {
            zh: { estimate: '野外约 1,000 只，其中约 400 只在柬埔寨', scope: '柬埔寨、越南、老挝、泰国和印度尼西亚的零散种群', year: '2024 年保护项目汇总', trend: '仍极度稀少且高度破碎；局部重引入和繁殖保护带来缓慢恢复' },
            en: { estimate: 'Approximately 1,000 in the wild, including about 400 in Cambodia', scope: 'Fragmented populations in Cambodia, Viet Nam, Laos, Thailand and Indonesia', year: 'Conservation-programme summary reported in 2024', trend: 'Still extremely scarce and fragmented; local reintroduction and breeding programmes are supporting slow recovery' }
        },
        'Sunda pangolin': {
            zh: { estimate: '暂无可靠的全球总量估计', scope: '东南亚大陆和大巽他群岛残存种群', year: 'IUCN 2019 年评估', trend: '下降；非法捕猎和贸易造成的损失难以完整统计' },
            en: { estimate: 'No reliable global population total is available', scope: 'Remaining populations across mainland Southeast Asia and the Greater Sunda Islands', year: 'IUCN assessment 2019', trend: 'Decreasing; losses from illegal hunting and trade are difficult to measure completely' }
        },
        'Tasmanian devil': {
            zh: { estimate: '野外约 17,500 只（估计范围 12,000–22,000）', scope: '塔斯马尼亚全岛野生种群', year: '2022 年州级资料汇总', trend: '下降；面部肿瘤病出现后，监测地点平均密度下降约 77%–80%' },
            en: { estimate: 'Approximately 17,500 in the wild (estimated range 12,000–22,000)', scope: 'Wild population across Tasmania', year: 'Tasmanian state summary, 2022', trend: 'Decreasing; monitored-site density fell by about 77%–80% after devil facial tumour disease emerged' },
            source: ['Tasmanian Government: Tasmanian devil population FAQ', 'https://nre.tas.gov.au/conservation/threatened-species-and-communities/lists-of-threatened-species/threatened-species-vertebrates/save-the-tasmanian-devil-program/tasmanian-devils-faqs']
        },
        'Tiger': {
            zh: { estimate: '约 3,726–5,578 只（不含幼崽），其中成熟个体平均估计约 3,140 只', scope: '全球野生种群', year: '2021 年数据，IUCN 2022 年评估', trend: '近年总体恢复但地区差异很大；仍只占历史分布区的一小部分' },
            en: { estimate: 'Approximately 3,726–5,578 individuals excluding cubs; mean estimate about 3,140 mature individuals', scope: 'Global wild population', year: '2021 data used in the 2022 IUCN assessment', trend: 'Recent overall recovery is uneven among countries; the species occupies only a fraction of its former range' },
            source: ['IUCN Cat Specialist Group: Tiger', 'https://www.catsg.org/living-species-tiger']
        },
        'Vaquita': {
            zh: { estimate: '2019–2023 年核心栖息区调查每年只观察到约 10 只；这不是完整种群估计', scope: '墨西哥加利福尼亚湾北部核心分布区', year: '2019–2023 年调查汇总；2025 年仍有确认目击', trend: '极度下降；仍面临非法刺网误捕' },
            en: { estimate: 'Surveys in the core habitat observed only about 10 different animals per year from 2019 to 2023; this is not a complete abundance estimate', scope: 'Core range in the northern Gulf of California, Mexico', year: '2019–2023 survey summary; confirmed sightings continued in 2025', trend: 'Severely decreasing; illegal gillnet bycatch remains the principal threat' },
            source: ['International Whaling Commission: Vaquita status summary', 'https://iwc.int/about-whales/intro-to-population-status/status-of-whales-graphics/summary-vaquita']
        }
    };
    const text = element => element ? element.textContent.replace(/\s+/g, ' ').trim() : '';
    const json = url => fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
    let loading = null;

    function load() {
        if (loading) return loading;
        loading = Promise.all([
            fetch('project.html').then(r => { if (!r.ok) throw new Error('Field guide failed to load'); return r.text(); }),
            json('images/animal-photo-credits.json'), json('images/animals/animal-locations.json'), json('images/animals/animal-details.json'),
            json('images/animals/animal-details-en.json')
        ]).then(([html, credits, locations, details, detailsEn]) => {
            const creditOf = new Map((credits || []).map(c => [c.title, c]));
            const placeOf = new Map((locations || []).map(l => [l.name, l]));
            const records = new Map();
            new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.animal-profile').forEach(article => {
                const name = text(article.querySelector('h3'));
                const statusEl = article.querySelector('.status');
                const key = [...(statusEl ? statusEl.classList : [])].map(c => c.replace('status--', '')).find(c => IUCN[c]) || '';
                const paragraphs = [...article.querySelectorAll('.animal-profile__body p')].map(p => {
                    const copy = p.cloneNode(true);
                    copy.querySelector('strong')?.remove();
                    return text(copy);
                });
                const label = text(article.querySelector('.specimen-number'));
                const credit = creditOf.get(name) || (name === 'Antarctic blue whale' ? creditOf.get('Blue whale') : null);
                const supplement = POPULATION_SUPPLEMENT[name];
                const baseDetails = (details && details[name]) || null;
                const baseDetailsEn = (detailsEn && detailsEn[name]) || null;
                const mergedDetails = supplement ? {
                    ...(baseDetails || {}), population: supplement.zh,
                    sources: [...(baseDetails?.sources || []), ...(supplement.source ? [{ label: supplement.source[0], url: supplement.source[1] }] : [])],
                    updated: '2026-11-10'
                } : baseDetails;
                const mergedDetailsEn = supplement ? {
                    ...(baseDetailsEn || {}), population: supplement.en,
                    sources: [...(baseDetailsEn?.sources || []), ...(supplement.source ? [{ label: supplement.source[0], url: supplement.source[1] }] : [])],
                    updated: '2026-11-10'
                } : baseDetailsEn;
                records.set(name, {
                    name, key,
                    latin: text(article.querySelector('.scientific-name')),
                    number: label.split('·')[0].trim(),
                    habitatLabel: label.split('·').slice(1).join('·').trim(),
                    habitats: (article.dataset.habitat || '').split(' ').filter(Boolean),
                    feature: paragraphs[0] || '', range: paragraphs[1] || '', risk: paragraphs[2] || '',
                    credit, place: placeOf.get(name) || null,
                    details: mergedDetails,
                    detailsEn: mergedDetailsEn
                });
            });
            return records;
        }).catch(error => { loading = null; throw error; });
        return loading;
    }

    // "Photo: artist · licence" caption linking to the Wikimedia Commons page the photograph came from.
    window.animalCredit = record => {
        const caption = document.createElement('figcaption');
        caption.className = 'photo-credit';
        const c = record.credit;
        if (!c) { caption.textContent = 'Photo credit: see CREDITS.md'; return caption; }
        const artist = (c.artist || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const short = artist.length > 42 ? artist.slice(0, 41) + '…' : artist;
        caption.append('Photo: ');
        const link = document.createElement('a');
        link.href = c.source; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = (short || 'Wikimedia Commons') + ' · ' + c.license;
        link.title = artist + ' · ' + c.license;
        link.dataset.i18nOff = '';
        caption.append(link);
        return caption;
    };
    return { load, IUCN, ORDER };
})();
