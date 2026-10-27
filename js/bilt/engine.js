function cardById(id) {
    for (var i = 0; i < CARDS.length; i++) {
        if (CARDS[i].id === id) return CARDS[i];
    }
    return null;
}

function exclusiveKeys(card) {
    var keys = [];
    if (!card || typeof CARD_RULES === "undefined") return keys;
    if (card.group && CARD_RULES.exclusiveGroups[card.group]) keys.push(card.group);
    if (card.exclusive && CARD_RULES.exclusiveGroups[card.exclusive] && keys.indexOf(card.exclusive) === -1) {
        keys.push(card.exclusive);
    }
    return keys;
}

function isValidPortfolio(ids) {
    var counts = {};
    for (var i = 0; i < ids.length; i++) {
        var keys = exclusiveKeys(cardById(ids[i]));
        for (var k = 0; k < keys.length; k++) {
            var key = keys[k];
            counts[key] = (counts[key] || 0) + 1;
            if (counts[key] > CARD_RULES.exclusiveGroups[key]) return false;
        }
    }
    return true;
}

function creditKey(cardId, creditId) {
    return cardId + ":" + creditId;
}

function netAnnualFee(card, worthByKey) {
    var worth = 0;
    var credits = card.credits || [];
    for (var i = 0; i < credits.length; i++) {
        var key = creditKey(card.id, credits[i].id);
        var raw = worthByKey && worthByKey[key];
        var fallback = credits[i].defaultWorth !== undefined ? credits[i].defaultWorth : credits[i].amount;
        var value = raw === undefined || raw === "" ? Number(fallback) || 0 : parseFloat(raw);
        if (isNaN(value) || value < 0) value = 0;
        worth += value;
    }
    return (Number(card.annualFee) || 0) - worth;
}

function portfolioNetFee(cardIds, worthByKey) {
    var total = 0;
    for (var i = 0; i < cardIds.length; i++) {
        var card = cardById(cardIds[i]);
        if (!card) continue;
        total += netAnnualFee(card, worthByKey);
    }
    return total;
}

function atmosRentNet(annualRent, centsPerPoint) {
    if (!(centsPerPoint > 1) || !(annualRent > 0)) return 0;
    var capped = Math.min(annualRent, 50000);
    var charged = capped * 1.03;
    var points = charged * 3;
    var value = points * (centsPerPoint / 100);
    var fee = capped * 0.03;
    return value - fee;
}

var EVERYDAY_CATEGORIES = ["dining", "grocery", "gas", "online", "travel", "other"];

function normalizeCents(input) {
    var cents = {};
    if (typeof POINT_VALUES !== "undefined") {
        for (var i = 0; i < POINT_VALUES.length; i++) cents[POINT_VALUES[i].id] = POINT_VALUES[i].cents;
    }
    if (!input) return cents;
    for (var key in input) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
        var numeric = parseFloat(input[key]);
        if (!isNaN(numeric) && numeric >= 0) cents[key] = numeric;
    }
    return cents;
}

function annualFromMonthly(monthly) {
    var keys = ["housing"].concat(EVERYDAY_CATEGORIES);
    var annual = {};
    for (var i = 0; i < keys.length; i++) {
        var numeric = parseFloat(monthly && monthly[keys[i]]);
        annual[keys[i]] = !isNaN(numeric) && numeric > 0 ? numeric * 12 : 0;
    }
    annual.housingType = monthly && monthly.housingType === "mortgage" ? "mortgage" : "rent";
    annual.ruleSet = monthly && monthly.ruleSet === "2027" ? "2027" : "legacy";
    return annual;
}

function cardForRules(card, ruleSet) {
    if (!card || ruleSet !== "2027" || !card.rules2027) return card;
    var copy = {};
    for (var key in card) {
        if (Object.prototype.hasOwnProperty.call(card, key)) copy[key] = card[key];
    }
    for (var over in card.rules2027) {
        if (Object.prototype.hasOwnProperty.call(card.rules2027, over)) copy[over] = card.rules2027[over];
    }
    return copy;
}

function findBiltCard(cards) {
    for (var i = 0; i < cards.length; i++) {
        if (cards[i].group === "bilt") return cards[i];
    }
    return null;
}

function findAlaskaCard(cards, housingType) {
    for (var i = 0; i < cards.length; i++) {
        var rule = cards[i].housing;
        if (!rule || rule.kind !== "atmos-rent") continue;
        if (rule.rentOnly && housingType === "mortgage") continue;
        return cards[i];
    }
    return null;
}

function dollarsPerPoint(card, cards, cents) {
    if (!card) return 0;
    if (card.currency === "cash") return 0.01;
    var value = cents[card.currency] || 0;
    if (card.transfer) {
        var full = false;
        var withIds = card.transfer.fullValueWith || [];
        for (var i = 0; i < cards.length; i++) {
            if (withIds.indexOf(cards[i].id) !== -1) full = true;
        }
        if (!full) {
            var transferred = (card.transfer.ratioWithout || 0) * value;
            var floor = card.transfer.cashCents || 0;
            value = transferred > floor ? transferred : floor;
        }
    }
    return value / 100;
}

function unlimitedRate(card, cat, choice) {
    if (!card) return 0;
    if (card.categoryChoice && choice && cat === choice && card.categoryChoice.categories.indexOf(choice) !== -1) {
        return card.categoryChoice.rate;
    }
    if (card.cap && card.cap.categories.indexOf(cat) !== -1) return card.cap.thenRate;
    return card.earn[cat] || 0;
}

function bestOtherRate(cards, biltId, cat, cents, choice) {
    var best = { value: -1, cardId: "", rate: 0, cents: 0 };
    for (var i = 0; i < cards.length; i++) {
        if (cards[i].id === biltId) continue;
        var rate = unlimitedRate(cards[i], cat, null);
        var pointCents = dollarsPerPoint(cards[i], cards, cents) * 100;
        var value = rate * pointCents / 100;
        if (value > best.value) best = { value: value, cardId: cards[i].id, rate: rate, cents: pointCents };
    }
    if (best.value < 0) return { value: 0, cardId: "", rate: 0, cents: 0 };
    return best;
}

function spendPools(annual, bilt, choice) {
    var pools = [];
    for (var i = 0; i < EVERYDAY_CATEGORIES.length; i++) {
        var cat = EVERYDAY_CATEGORIES[i];
        var amount = annual[cat] || 0;
        if (amount <= 0) continue;
        var cap = 0;
        if (bilt && choice === cat && bilt.categoryChoice && bilt.categoryChoice.caps && bilt.categoryChoice.caps[cat]) {
            cap = bilt.categoryChoice.caps[cat];
        }
        if (cap && amount > cap) {
            pools.push({ cat: cat, amount: cap, biltRate: bilt.categoryChoice.rate });
            pools.push({ cat: cat, amount: amount - cap, biltRate: bilt.earn[cat] || 0 });
        } else if (bilt) {
            pools.push({ cat: cat, amount: amount, biltRate: unlimitedRate(bilt, cat, choice) });
        } else {
            pools.push({ cat: cat, amount: amount, biltRate: 0 });
        }
    }
    return pools;
}

function cardCount(card) {
    var count = card && card.count ? Math.floor(card.count) : 1;
    if (!(count >= 1)) count = 1;
    if (card && card.maxCount && count > card.maxCount) count = card.maxCount;
    return count;
}

function scarceOffers(cards, cents) {
    var offers = [];
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var count = cardCount(card);
        var pointCents = dollarsPerPoint(card, cards, cents) * 100;
        if (card.rotating) {
            offers.push({
                cardId: card.id,
                cats: card.rotating.categories,
                value: card.rotating.rate * pointCents / 100,
                rate: card.rotating.rate,
                cents: pointCents,
                capKey: card.id + "-rotating",
                cap: card.rotating.quarterlyCap * card.rotating.usableQuarters * count,
                tag: "5x"
            });
        }
        if (card.cap) {
            for (var n = 0; n < card.cap.categories.length; n++) {
                var cat = card.cap.categories[n];
                var capRate = card.earn[cat] || 0;
                offers.push({
                    cardId: card.id,
                    cats: [cat],
                    value: capRate * pointCents / 100,
                    rate: capRate,
                    cents: pointCents,
                    capKey: card.id + "-cap",
                    cap: card.cap.quarterly * 4 * count,
                    tag: String(capRate) + "%"
                });
            }
        }
        if (card.topCategory) {
            for (var k = 0; k < count; k++) {
                for (var t = 0; t < card.topCategory.categories.length; t++) {
                    var topCat = card.topCategory.categories[t];
                    offers.push({
                        cardId: card.id,
                        cats: [topCat],
                        value: card.topCategory.rate * pointCents / 100,
                        rate: card.topCategory.rate,
                        cents: pointCents,
                        capKey: card.id + "-top-" + k + "-" + topCat,
                        cap: card.topCategory.monthlyCap * 12,
                        selectionGroup: card.id + "-top-" + k,
                        tag: String(card.topCategory.rate) + "x"
                    });
                }
            }
        }
    }
    return offers;
}

function offerGainOn(offer, slices) {
    var pieces = [];
    var eligibleAmount = 0;
    for (var s = 0; s < slices.length; s++) {
        var slice = slices[s];
        if (slice.tag || !(slice.amount > 1e-9)) continue;
        if (offer.cats.indexOf(slice.cat) === -1) continue;
        eligibleAmount += slice.amount;
        pieces.push({ amount: slice.amount, gain: offer.value - (slice.value + (slice.bonus || 0)) });
    }
    pieces.sort(function (a, b) { return b.gain - a.gain; });
    var room = offer.cap;
    var totalGain = 0;
    for (var p = 0; p < pieces.length && room > 1e-9; p++) {
        if (pieces[p].gain <= 1e-9) break;
        var take = Math.min(room, pieces[p].amount);
        totalGain += take * pieces[p].gain;
        room -= take;
    }
    return { totalGain: totalGain, eligibleAmount: eligibleAmount };
}

function reserveOffer(offer, slices) {
    var room = offer.cap;
    var guard = 0;
    while (room > 1e-9 && guard < 40) {
        guard++;
        var bestIndex = -1;
        var bestGain = 1e-9;
        for (var s = 0; s < slices.length; s++) {
            var slice = slices[s];
            if (slice.tag || !(slice.amount > 1e-9)) continue;
            if (offer.cats.indexOf(slice.cat) === -1) continue;
            var gain = offer.value - (slice.value + (slice.bonus || 0));
            if (gain > bestGain) {
                bestGain = gain;
                bestIndex = s;
            }
        }
        if (bestIndex < 0) break;
        var take = Math.min(slices[bestIndex].amount, room);
        slices[bestIndex].amount -= take;
        slices.push({ cat: slices[bestIndex].cat, amount: take, value: offer.value, tag: offer.tag, bonus: 0 });
        room -= take;
    }
}

function lockTopCategoryOffers(offers, slices) {
    var groups = {};
    var order = [];
    for (var i = 0; i < offers.length; i++) {
        var group = offers[i].selectionGroup;
        if (!group) continue;
        if (!groups[group]) {
            groups[group] = [];
            order.push(group);
        }
        groups[group].push(offers[i]);
    }
    var work = cloneSlices(slices);
    var winners = {};
    for (var g = 0; g < order.length; g++) {
        var key = order[g];
        var threshold = groups[key][0].value;
        var probe = cloneSlices(work);
        for (var f = 0; f < offers.length; f++) {
            if (!offers[f].selectionGroup && offers[f].value > threshold + 1e-12) reserveOffer(offers[f], probe);
        }
        var best = null;
        for (var o = 0; o < groups[key].length; o++) {
            var offer = groups[key][o];
            var scored = offerGainOn(offer, probe);
            if (
                scored.totalGain > 1e-9 &&
                (!best || scored.totalGain > best.totalGain + 1e-9 ||
                    (Math.abs(scored.totalGain - best.totalGain) <= 1e-9 && scored.eligibleAmount > best.eligibleAmount))
            ) {
                best = { offer: offer, totalGain: scored.totalGain, eligibleAmount: scored.eligibleAmount };
            }
        }
        if (best) {
            winners[key] = best.offer;
            reserveOffer(best.offer, work);
        }
    }
    var locked = [];
    for (var n = 0; n < offers.length; n++) {
        if (!offers[n].selectionGroup || winners[offers[n].selectionGroup] === offers[n]) {
            locked.push(offers[n]);
        }
    }
    return locked;
}

function stealScarce(slices, cards, cents) {
    var offers = scarceOffers(cards, cents);
    offers = lockTopCategoryOffers(offers, slices);
    if (!offers.length) return;
    var left = {};
    for (var i = 0; i < offers.length; i++) {
        if (left[offers[i].capKey] === undefined) left[offers[i].capKey] = offers[i].cap;
    }
    var guard = 0;
    while (guard < 40) {
        guard++;
        var best = null;
        for (var o = 0; o < offers.length; o++) {
            var capLeft = left[offers[o].capKey];
            if (!(capLeft > 1e-9)) continue;
            for (var s = 0; s < slices.length; s++) {
                var slice = slices[s];
                if (slice.tag || !(slice.amount > 1e-9)) continue;
                if (offers[o].cats.indexOf(slice.cat) === -1) continue;
                var gain = offers[o].value - (slice.value + (slice.bonus || 0));
                if (gain <= 1e-9) continue;
                if (!best || gain > best.gain) {
                    best = { offer: offers[o], index: s, gain: gain, take: Math.min(slice.amount, capLeft) };
                }
            }
        }
        if (!best || !(best.take > 1e-9)) break;
        var source = slices[best.index];
        source.amount -= best.take;
        slices.push({
            cat: source.cat,
            amount: best.take,
            value: best.offer.value,
            rate: best.offer.rate,
            cents: best.offer.cents,
            cardId: best.offer.cardId,
            tag: best.offer.tag,
            bonusKind: "",
            bonus: 0
        });
        left[best.offer.capKey] -= best.take;
    }
}

function placeSpend(cards, annual, cents, choice, bilt, bonusAt) {
    var pools = spendPools(annual, bilt, choice);
    var parts = [];
    for (var i = 0; i < pools.length; i++) {
        var other = bestOtherRate(cards, bilt ? bilt.id : "", pools[i].cat, cents, choice);
        var biltCents = bilt ? dollarsPerPoint(bilt, cards, cents) * 100 : 0;
        var biltBase = bilt ? pools[i].biltRate * biltCents / 100 : -1;
        parts.push({
            cat: pools[i].cat,
            amount: pools[i].amount,
            otherValue: other.value,
            otherId: other.cardId,
            otherRate: other.rate,
            otherCents: other.cents,
            biltBase: biltBase,
            biltRate: pools[i].biltRate,
            biltCents: biltCents
        });
    }
    parts.sort(function (a, b) {
        return (a.otherValue - a.biltBase) - (b.otherValue - b.biltBase);
    });
    var slices = [];
    var biltSpend = 0;
    for (var p = 0; p < parts.length; p++) {
        var leftAmount = parts[p].amount;
        while (leftAmount > 1e-9) {
            var bonus = bilt ? bonusAt(biltSpend) : { extra: 0, kind: "", room: Infinity };
            if (bilt && parts[p].biltBase + bonus.extra + 1e-12 >= parts[p].otherValue) {
                var room = bonus.room > 0 ? bonus.room : leftAmount;
                var take = Math.min(leftAmount, room);
                slices.push({
                    cat: parts[p].cat,
                    amount: take,
                    value: parts[p].biltBase,
                    rate: parts[p].biltRate,
                    cents: parts[p].biltCents,
                    cardId: bilt.id,
                    tag: "",
                    bonusKind: bonus.kind,
                    bonus: bonus.extra
                });
                biltSpend += take;
                leftAmount -= take;
            } else {
                slices.push({
                    cat: parts[p].cat,
                    amount: leftAmount,
                    value: parts[p].otherValue,
                    rate: parts[p].otherRate,
                    cents: parts[p].otherCents,
                    cardId: parts[p].otherId,
                    tag: "",
                    bonusKind: "",
                    bonus: 0
                });
                leftAmount = 0;
            }
        }
    }
    stealScarce(slices, cards, cents);
    return slices;
}

function cloneSlices(slices) {
    var copy = [];
    for (var i = 0; i < slices.length; i++) {
        var slice = slices[i];
        copy.push({
            cat: slice.cat,
            amount: slice.amount,
            value: slice.value,
            rate: slice.rate,
            cents: slice.cents,
            cardId: slice.cardId,
            tag: slice.tag,
            bonusKind: slice.bonusKind,
            bonus: slice.bonus
        });
    }
    return copy;
}

function spendOnCard(slices, cardId) {
    var total = 0;
    for (var i = 0; i < slices.length; i++) {
        if (slices[i].cardId === cardId) total += slices[i].amount;
    }
    return total;
}

function pullToSpend(slices, bilt, target, cards, cents, choice) {
    var copy = cloneSlices(slices);
    var guard = 0;
    while (spendOnCard(copy, bilt.id) + 1e-6 < target && guard < 80) {
        guard++;
        var groceryOn = 0;
        for (var g = 0; g < copy.length; g++) {
            if (copy[g].cardId === bilt.id && copy[g].cat === "grocery") groceryOn += copy[g].amount;
        }
        var need = target - spendOnCard(copy, bilt.id);
        var bestIndex = -1;
        var bestOpp = Infinity;
        var bestRate = 0;
        var bestRoom = 0;
        for (var i = 0; i < copy.length; i++) {
            var slice = copy[i];
            if (slice.cardId === bilt.id || !(slice.amount > 1e-9)) continue;
            var rate = unlimitedRate(bilt, slice.cat, choice);
            var room = Infinity;
            if (slice.cat === "grocery" && choice === "grocery" && bilt.categoryChoice && bilt.categoryChoice.caps && bilt.categoryChoice.caps.grocery) {
                var capLeft = bilt.categoryChoice.caps.grocery - groceryOn;
                if (capLeft > 1e-9) {
                    rate = bilt.categoryChoice.rate;
                    room = capLeft;
                } else {
                    rate = bilt.earn.grocery || 0;
                }
            }
            var opp = slice.value - rate * dollarsPerPoint(bilt, cards, cents);
            if (opp < bestOpp) {
                bestOpp = opp;
                bestIndex = i;
                bestRate = rate;
                bestRoom = room;
            }
        }
        if (bestIndex < 0) return null;
        var source = copy[bestIndex];
        var take = Math.min(source.amount, need, bestRoom);
        if (!(take > 1e-9)) return null;
        source.amount -= take;
        var movedCents = dollarsPerPoint(bilt, cards, cents) * 100;
        copy.push({
            cat: source.cat,
            amount: take,
            value: bestRate * movedCents / 100,
            rate: bestRate,
            cents: movedCents,
            cardId: bilt.id,
            tag: "",
            bonusKind: "",
            bonus: 0
        });
    }
    if (spendOnCard(copy, bilt.id) + 1e-4 < target) return null;
    return copy;
}

function housingPointCount(spend, housing) {
    if (!(housing > 0)) return { points: 0, tier: "" };
    var ratio = spend / housing;
    if (ratio < 0.25) return { points: 250 * 12, tier: "floor" };
    if (ratio < 0.5) return { points: housing * 0.5, tier: "0.5x" };
    if (ratio < 0.75) return { points: housing * 0.75, tier: "0.75x" };
    if (ratio < 1) return { points: housing, tier: "1x" };
    return { points: housing * 1.25, tier: "1.25x" };
}

function alaskaOverCap(card, housing, cents) {
    if (!card || !(housing > 0)) return null;
    var rule = card.housing;
    var over = housing - rule.annualCap;
    if (!(over > 0.5) || !(rule.overRate > 0)) return null;
    var asCents = cents[card.currency] || 0;
    var multiplier = rule.overRate * (rule.earnsOnFee ? (1 + rule.fee) : 1);
    var raw = over * (multiplier * (asCents / 100) - rule.fee);
    return {
        basis: over,
        rate: multiplier,
        cents: asCents,
        feeAmount: over * rule.fee,
        raw: raw,
        value: raw > 0 ? raw : 0
    };
}

function alaskaHousingValue(card, housing, cents) {
    if (!card || !(housing > 0)) return 0;
    var rule = card.housing;
    var asCents = cents[card.currency] || 0;
    if (!(asCents > rule.worthAboveCents)) return 0;
    var capped = Math.min(housing, rule.annualCap);
    var multiplier = rule.rate * (rule.earnsOnFee ? (1 + rule.fee) : 1);
    var over = alaskaOverCap(card, housing, cents);
    return capped * (multiplier * (asCents / 100) - rule.fee) + (over ? over.value : 0);
}

function acceleratorBonus(card, biltSpend, leftCash, cpp) {
    if (!card || card.id === "bilt-blue" || !(cpp > 0)) return { cost: 0, pointsValue: 0 };
    var times = Math.min(5, Math.floor(leftCash / 200 + 1e-9), Math.floor(biltSpend / 5000 + 1e-9));
    if (times < 1) return { cost: 0, pointsValue: 0 };
    return { cost: times * 200, pointsValue: times * 5000 * cpp, points: times * 5000, cents: cpp * 100 };
}

function baseEarn(slices) {
    var total = 0;
    for (var i = 0; i < slices.length; i++) total += slices[i].amount * slices[i].value;
    return total;
}

function buildLines(slices, housing, housingCardId, housingTag, housingValue, cashValue, accel, housingMeta) {
    var lines = [];
    var merged = {};
    var order = [];
    for (var i = 0; i < slices.length; i++) {
        var slice = slices[i];
        if (!(slice.amount > 0.5)) continue;
        var key = slice.cat + "|" + slice.cardId + "|" + (slice.tag || "") + "|" + (slice.rate || 0);
        if (!merged[key]) {
            merged[key] = {
                cat: slice.cat,
                cardId: slice.cardId,
                tag: slice.tag || "",
                amount: 0,
                value: 0,
                rate: slice.rate || 0,
                cents: slice.cents || 0,
                points: 0,
                feeAmount: 0
            };
            order.push(key);
        }
        merged[key].amount += slice.amount;
        merged[key].value += slice.amount * slice.value;
    }
    for (var n = 0; n < order.length; n++) lines.push(merged[order[n]]);
    if (housing > 0) {
        var meta = housingMeta || {};
        var over = housingValue > 0 ? meta.over : null;
        lines.push({
            cat: "housing",
            cardId: housingValue > 0 ? housingCardId : "",
            tag: housingValue > 0 ? housingTag : "",
            amount: meta.basis > 0 ? meta.basis : housing,
            value: housingValue - (over ? over.value : 0),
            rate: meta.rate || 0,
            cents: meta.cents || 0,
            points: meta.points || 0,
            feeAmount: meta.feeAmount || 0,
            capped: !!over
        });
        if (over) {
            lines.push({
                cat: "housing",
                cardId: housingCardId,
                tag: "over-cap",
                amount: over.basis,
                value: over.value,
                raw: over.raw,
                rate: over.rate,
                cents: over.cents,
                points: 0,
                feeAmount: over.feeAmount
            });
        }
    }
    if (cashValue > 0.5) {
        lines.push({ cat: "bilt-cash", cardId: "", tag: "", amount: cashValue, value: 0, rate: 0, cents: 0, points: 0, feeAmount: 0 });
    }
    if (accel && accel.pointsValue > 0.5) {
        lines.push({
            cat: "accelerator",
            cardId: "",
            tag: accel.tag || "用掉 $" + Math.round(accel.cost),
            amount: accel.points || 0,
            value: accel.pointsValue,
            rate: 0,
            cents: accel.cents || 0,
            points: accel.points || 0,
            feeAmount: 0
        });
    }
    return lines;
}

function candidateFrom(cards, slices, mode, choice, housingValue, housingCardId, housingTag, cashValue, accel, worth, annualHousing, housingMeta) {
    var fee = 0;
    for (var i = 0; i < cards.length; i++) fee += netAnnualFee(cards[i], worth) * cardCount(cards[i]);
    var accelPoints = accel ? accel.pointsValue : 0;
    var net = baseEarn(slices) + housingValue + accelPoints - fee;
    var lines = buildLines(slices, annualHousing, housingCardId, housingTag, housingValue, cashValue, accel, housingMeta);
    lines.push({ cat: "fee", cardId: "", tag: "", amount: 0, value: -fee, rate: 0, cents: 0, points: 0, feeAmount: 0 });
    return {
        net: net,
        mode: mode,
        choice: choice || "",
        tier: housingTag || "",
        fee: fee,
        lines: lines
    };
}

function zeroBonus() {
    return { extra: 0, kind: "", room: Infinity };
}

function biltCashGift(card) {
    return card && card.annualBiltCash > 0 ? card.annualBiltCash : 0;
}

function redeemBonus(card, housing, cpp) {
    var housingNeed = housing > 0 ? housing * 0.03 : 0;
    var unlockSpend = Math.max(0, housingNeed - biltCashGift(card)) / 0.04;
    var unlockExtra = housing > 0 ? (0.04 / 0.03) * cpp : 0;
    var accelExtra = card && card.id !== "bilt-blue" && cpp > 0 ? cpp : 0;
    var accelRoom = accelExtra > 0 ? 5 * 5000 : 0;
    return function (spend) {
        if (spend < unlockSpend - 1e-9) {
            return { extra: unlockExtra, kind: "unlock", room: unlockSpend - spend };
        }
        var used = spend - unlockSpend;
        if (accelExtra > 0 && used < accelRoom - 1e-9) {
            return { extra: accelExtra, kind: "accelerator", room: accelRoom - used };
        }
        return { extra: 0, kind: "", room: Infinity };
    };
}

function tierRate(tier) {
    if (tier === "0.5x") return 0.5;
    if (tier === "0.75x") return 0.75;
    if (tier === "1x") return 1;
    if (tier === "1.25x") return 1.25;
    return 0;
}

function housingPointsMeta(tier, housing, cpp) {
    return {
        basis: housing,
        rate: tierRate(tier),
        cents: cpp * 100,
        points: tier === "floor" ? 3000 : 0,
        feeAmount: 0
    };
}

function alaskaHousingMeta(card, housing, cents) {
    if (!card || !(housing > 0)) return null;
    var rule = card.housing;
    var asCents = cents[card.currency] || 0;
    if (!(asCents > rule.worthAboveCents)) return null;
    var capped = Math.min(housing, rule.annualCap);
    var multiplier = rule.rate * (rule.earnsOnFee ? (1 + rule.fee) : 1);
    return {
        basis: capped,
        rate: multiplier,
        cents: asCents,
        points: 0,
        feeAmount: capped * rule.fee,
        over: alaskaOverCap(card, housing, cents)
    };
}

function housingPointCandidates(cards, annual, cents, worth, choice, bilt, cpp, bonusAt, extras) {
    var housing = annual.housing || 0;
    var list = [];
    var natural = placeSpend(cards, annual, cents, choice, bilt, bonusAt);
    var naturalSpend = spendOnCard(natural, bilt.id);
    var targets = [naturalSpend];
    var ratios = [0.25, 0.5, 0.75, 1];
    for (var r = 0; r < ratios.length; r++) {
        var target = ratios[r] * housing;
        if (target > naturalSpend + 1e-6) targets.push(target);
    }
    for (var t = 0; t < targets.length; t++) {
        var slices = Math.abs(targets[t] - naturalSpend) < 1e-6 ? natural : pullToSpend(natural, bilt, targets[t], cards, cents, choice);
        if (!slices) continue;
        var counted = housingPointCount(spendOnCard(slices, bilt.id), housing);
        var extra = extras ? extras(slices, counted) : null;
        var candidate = candidateFrom(
            cards, slices, "housing-points", choice,
            counted.points * cpp, bilt.id, counted.tier,
            extra ? extra.left : 0, extra ? extra.accel : null, worth, housing,
            housingPointsMeta(counted.tier, housing, cpp)
        );
        if (extra) candidate.cashPool = extra.pool;
        list.push(candidate);
    }
    return list;
}

function hasAccelerator(card) {
    return !!card && card.group === "bilt" && card.id !== "bilt-blue";
}

function acceleratorBonusAt(card, cpp, times) {
    var extra = hasAccelerator(card) && cpp > 0 ? cpp : 0;
    var room = extra > 0 ? times * 5000 : 0;
    return function (spend) {
        if (extra > 0 && spend < room - 1e-9) return { extra: extra, kind: "accelerator", room: room - spend };
        return { extra: 0, kind: "", room: Infinity };
    };
}

function accelerator2027(card, biltSpend, pool, cpp) {
    if (!hasAccelerator(card) || !(cpp > 0)) return { cost: 0, pointsValue: 0 };
    var times = Math.min(5, Math.floor(pool / 200 + 1e-9));
    var boosted = Math.min(biltSpend, times * 5000);
    if (!(boosted > 0.5)) return { cost: 0, pointsValue: 0 };
    var used = Math.ceil(boosted / 5000 - 1e-9);
    return { cost: used * 200, pointsValue: boosted * cpp, points: boosted, cents: cpp * 100 };
}

function biltPointsOn(slices, cardId) {
    var total = 0;
    for (var i = 0; i < slices.length; i++) {
        if (slices[i].cardId === cardId) total += slices[i].amount * (slices[i].rate || 0);
    }
    return total;
}

function milestoneCash(points) {
    return points > 0 ? Math.floor(points / 25000 + 1e-9) * 50 : 0;
}

function scoreRules2027(cards, annual, cents, worth, choice, bilt, cpp) {
    var gift = biltCashGift(bilt);
    var pool = gift;
    var list = [];
    function extras(slices, counted) {
        var earned = biltPointsOn(slices, bilt.id) + counted.points;
        var milestone = milestoneCash(earned);
        var total = gift + milestone;
        var accel = accelerator2027(bilt, spendOnCard(slices, bilt.id), total, cpp);
        if (accel.pointsValue > 0) {
            var source = [];
            if (gift > 0) source.push("每年送 $" + gift);
            if (milestone > 0) source.push("累计积分送 $" + milestone);
            accel.tag = "用掉 Bilt Cash $" + Math.round(accel.cost) + "，共有 $" + Math.round(total) + (source.length ? "（" + source.join(" + ") + "）" : "");
        }
        return { accel: accel, left: total - accel.cost, pool: total };
    }
    for (var pass = 0; pass < 2; pass++) {
        var times = Math.min(5, Math.floor(pool / 200 + 1e-9));
        list = housingPointCandidates(cards, annual, cents, worth, choice, bilt, cpp, acceleratorBonusAt(bilt, cpp, times), extras);
        var best = null;
        for (var i = 0; i < list.length; i++) {
            if (!best || list[i].net > best.net) best = list[i];
        }
        if (!best || best.cashPool === pool) break;
        pool = best.cashPool;
    }
    return list;
}

function scoreChoice(cards, annual, cents, worth, choice, bilt) {
    var housing = annual.housing || 0;
    var alaska = findAlaskaCard(cards, annual.housingType);
    var alaskaValue = alaskaHousingValue(alaska, housing, cents);
    var list = [];
    if (!bilt) {
        var plain = placeSpend(cards, annual, cents, null, null, zeroBonus);
        list.push(candidateFrom(
            cards, plain, "", "",
            alaskaValue, alaska && alaskaValue > 0 ? alaska.id : "", alaskaValue > 0 ? "3x" : "",
            0, null, worth, housing,
            alaska && alaskaValue > 0 ? alaskaHousingMeta(alaska, housing, cents) : null
        ));
        return list;
    }
    var cpp = dollarsPerPoint(bilt, cards, cents);
    if (annual.ruleSet === "2027") return scoreRules2027(cards, annual, cents, worth, choice, bilt, cpp);
    list = housingPointCandidates(cards, annual, cents, worth, choice, bilt, cpp, zeroBonus, null);
    var cashSlices = placeSpend(cards, annual, cents, choice, bilt, redeemBonus(bilt, housing, cpp));
    var cashSpend = spendOnCard(cashSlices, bilt.id);
    var earned = cashSpend * 0.04 + biltCashGift(bilt);
    var housingCash = Math.min(earned, Math.max(housing, 0) * 0.03);
    var unlockedValue = housing > 0 && housingCash > 0 ? (housingCash / 0.03) * cpp : 0;
    var useAlaska = alaskaValue > unlockedValue;
    var housingValue = useAlaska ? alaskaValue : unlockedValue;
    var housingId = "";
    var housingTag = "";
    if (housingValue > 0 && useAlaska) {
        housingId = alaska.id;
        housingTag = "3x";
    } else if (unlockedValue > 0) {
        housingId = bilt.id;
        var fullUnlock = housingCash + 1e-6 >= housing * 0.03;
        housingTag = (fullUnlock ? "1×" : "未满 1×") + " · 用掉 Bilt Cash $" + Math.round(housingCash);
    }
    var left = earned - (useAlaska ? 0 : housingCash);
    var accel = acceleratorBonus(bilt, cashSpend, left, cpp);
    var cashMeta = null;
    if (housingValue > 0 && useAlaska) cashMeta = alaskaHousingMeta(alaska, housing, cents);
    else if (unlockedValue > 0) {
        cashMeta = { basis: housingCash / 0.03, rate: 1, cents: cpp * 100, points: 0, feeAmount: 0 };
    }
    list.push(candidateFrom(
        cards, cashSlices, "bilt-cash", choice,
        housingValue, housingId, housingTag,
        left - accel.cost, accel, worth, housing,
        cashMeta
    ));
    return list;
}

function withCount(card, count) {
    var copy = {};
    for (var key in card) {
        if (Object.prototype.hasOwnProperty.call(card, key)) copy[key] = card[key];
    }
    copy.count = count;
    return copy;
}

function scorePortfolio(cardIds, monthly, centsInput, worthByKey, countById) {
    if (!cardIds || !cardIds.length || !isValidPortfolio(cardIds)) return null;
    var ruleSet = monthly && monthly.ruleSet === "2027" ? "2027" : "legacy";
    var cards = [];
    for (var i = 0; i < cardIds.length; i++) {
        var card = cardForRules(cardById(cardIds[i]), ruleSet);
        if (!card) continue;
        var requested = countById && countById[card.id] ? parseInt(countById[card.id], 10) : 1;
        if (!(requested >= 1)) requested = 1;
        if (!card.maxCount) requested = 1;
        cards.push(withCount(card, Math.min(requested, card.maxCount || 1)));
    }
    if (!cards.length) return null;
    var cents = normalizeCents(centsInput);
    var annual = annualFromMonthly(monthly);
    var bilt = findBiltCard(cards);
    var choices = bilt && bilt.categoryChoice ? bilt.categoryChoice.categories.slice() : [null];
    var all = [];
    for (var c = 0; c < choices.length; c++) {
        var found = scoreChoice(cards, annual, cents, worthByKey || {}, choices[c], bilt);
        for (var k = 0; k < found.length; k++) all.push(found[k]);
    }
    if (!all.length) return null;
    all.sort(function (a, b) { return b.net - a.net; });
    var best = all[0];
    best.altNet = null;
    best.altMode = "";
    for (var a = 1; a < all.length; a++) {
        if (all[a].mode && all[a].mode !== best.mode) {
            best.altNet = all[a].net;
            best.altMode = all[a].mode;
            break;
        }
    }
    return best;
}
