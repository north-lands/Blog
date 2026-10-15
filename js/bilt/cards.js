var CARD_RULES = {
    exclusiveGroups: {
        bilt: 1,
        housing: 1
    }
};

var CARDS = [
    {
        id: "bilt-blue",
        group: "bilt",
        exclusive: "housing",
        en: "Bilt Blue",
        zh: "Bilt Blue",
        currency: "bilt",
        annualFee: 0,
        modes: ["housing-points", "bilt-cash"],
        earn: { dining: 1, grocery: 1, gas: 1, online: 1, travel: 1, other: 1 },
        housing: { kind: "bilt" },
        note: "日常消费按 1 倍。合作餐厅和 Bilt Travel 的更高倍率不记进固定类别。"
    },
    {
        id: "bilt-obsidian",
        group: "bilt",
        exclusive: "housing",
        en: "Bilt Obsidian",
        zh: "Bilt Obsidian",
        currency: "bilt",
        annualFee: 95,
        modes: ["housing-points", "bilt-cash"],
        categoryChoice: { categories: ["dining", "grocery"], rate: 3, caps: { grocery: 25000 } },
        earn: { dining: 1, grocery: 1, gas: 1, online: 1, travel: 2, other: 1 },
        housing: { kind: "bilt" },
        credits: [{ id: "hotel", amount: 100, defaultWorth: 0, en: "Hotel credit", zh: "酒店额度" }],
        note: "餐饮或超市全年选一个 3 倍，超市每年上限 $25,000。旅行按通道外的 2 倍。"
    },
    {
        id: "bilt-palladium",
        group: "bilt",
        exclusive: "housing",
        en: "Bilt Palladium",
        zh: "Bilt Palladium",
        currency: "bilt",
        annualFee: 495,
        modes: ["housing-points", "bilt-cash"],
        earn: { dining: 2, grocery: 2, gas: 2, online: 2, travel: 2, other: 2 },
        housing: { kind: "bilt" },
        annualBiltCash: 200,
        credits: [
            { id: "hotel", amount: 400, defaultWorth: 280, en: "Hotel credit", zh: "酒店额度" }
        ],
        note: "日常消费 2 倍。Bilt 餐厅和 Bilt Travel 的更高倍率不记进固定类别。"
    },
    {
        id: "chase-freedom-flex",
        en: "Chase Freedom Flex",
        zh: "Chase Freedom Flex",
        currency: "ur",
        annualFee: 0,
        earn: { dining: 3, grocery: 1, gas: 1, online: 1, travel: 1, other: 1 },
        housing: null,
        maxCount: 3,
        rotating: { categories: ["dining", "grocery", "online"], rate: 5, quarterlyCap: 1500, usableQuarters: 2 },
        note: "餐饮全年 3 倍。季度轮换 5 倍、每季最多 $1,500，只从餐饮、超市、网购里计，默认一年只有两个季度对得上，所以最多 $3,000 按 5 倍。Chase Travel 的 5 倍不记。药店 3 倍算在其他里。"
    },
    {
        id: "chase-sapphire-preferred",
        en: "Chase Sapphire Preferred",
        zh: "Chase Sapphire Preferred",
        currency: "ur",
        annualFee: 95,
        earn: { dining: 3, grocery: 1, gas: 3, online: 1, travel: 2, other: 1 },
        housing: null,
        credits: [{ id: "hotel", amount: 100, defaultWorth: 80, en: "Hotel credit", zh: "酒店额度" }],
        note: "超市只给网购超市 3 倍，表单里的超市按店内记 1 倍。旅行按通道外 2 倍，不含 Chase Travel 的 5 倍。"
    },
    {
        id: "citi-double-cash",
        en: "Citi Double Cash",
        zh: "Citi Double Cash",
        currency: "typ",
        annualFee: 0,
        earn: { dining: 2, grocery: 2, gas: 2, online: 2, travel: 2, other: 2 },
        housing: null,
        transfer: { fullValueWith: ["citi-strata-premier"], ratioWithout: 0.7, cashCents: 1 },
        note: "所有消费 2 倍 ThankYou。没有 Premier 时，转伙伴按 70%；和 Premier 在同一个 ThankYou 账户里则按你填的 TYP 估值。"
    },
    {
        id: "citi-strata-premier",
        en: "Citi Strata Premier",
        zh: "Citi Premier（现 Strata Premier）",
        currency: "typ",
        annualFee: 95,
        earn: { dining: 3, grocery: 3, gas: 3, online: 1, travel: 3, other: 1 },
        housing: null,
        credits: [{ id: "hotel", amount: 100, defaultWorth: 0, en: "Hotel credit", zh: "酒店额度" }],
        note: "餐饮、超市、加油、机票和酒店 3 倍。Citi Travel 的 10 倍不记进整个旅行类别。"
    },
    {
        id: "citi-custom-cash",
        en: "Citi Custom Cash",
        zh: "Citi Custom Cash",
        currency: "typ",
        annualFee: 0,
        earn: { dining: 1, grocery: 1, gas: 1, online: 1, travel: 1, other: 1 },
        housing: null,
        transfer: { fullValueWith: ["citi-strata-premier"], ratioWithout: 0.7, cashCents: 1 },
        maxCount: 3,
        topCategory: {
            categories: ["dining", "grocery", "gas", "travel"],
            rate: 5,
            monthlyCap: 500
        },
        note: "每月在餐饮、超市、加油、旅行里自动选增量收益最高的一类，前 $500 按 5 倍 TYP，超过部分按 1 倍。网购和「其他」不作为 5 倍类别。与 Freedom Flex 不重复计算。"
    },
    {
        id: "boa-atmos-ascent",
        exclusive: "housing",
        en: "Atmos Rewards Ascent",
        zh: "阿拉斯加 Atmos Ascent",
        currency: "as",
        annualFee: 95,
        earn: { dining: 1, grocery: 1, gas: 2, online: 1, travel: 1, other: 1 },
        housing: {
            kind: "atmos-rent",
            rate: 3,
            fee: 0.03,
            annualCap: 50000,
            earnsOnFee: true,
            worthAboveCents: 1
        },
        credits: [{
            id: "companion",
            amount: 99,
            defaultWorth: 0,
            en: "Companion fare",
            zh: "同伴票",
            hint: "每年消费满 $6,000 才有。按实际能用掉的金额填，用不到填 0。"
        }],
        note: "房租和房贷记在同一项住房里。经 Bilt 付这笔住房收 3% 手续费，并给 3 倍 Atmos，每年 $50,000 以内。里程估值不超过 1 美分则这笔住房不走这张卡。阿拉斯加本航 3 倍不记进整个旅行类别。"
    },
    {
        id: "wf-autograph",
        en: "Wells Fargo Autograph",
        zh: "富国 Autograph",
        currency: "wf",
        annualFee: 0,
        earn: { dining: 3, grocery: 1, gas: 3, online: 1, travel: 3, other: 1 },
        housing: null,
        note: "餐饮、加油、旅行和交通 3 倍。流媒体和电话套餐的 3 倍算在其他里，不把整个「其他」抬成 3 倍。"
    },
    {
        id: "boa-customized-cash",
        en: "Bank of America Customized Cash",
        zh: "美国银行 Customized Cash",
        currency: "cash",
        annualFee: 0,
        earn: { dining: 1, grocery: 2, gas: 1, online: 3, travel: 1, other: 1 },
        housing: null,
        maxCount: 3,
        cap: { categories: ["online", "grocery"], quarterly: 2500, thenRate: 1 },
        note: "自选网购 3% 现金，超市 2% 现金。这两类合计每季度 $2,500，超出后按 1%。只有现金，没有积分。"
    }
];
