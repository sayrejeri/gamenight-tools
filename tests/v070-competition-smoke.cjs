const assert = require('node:assert/strict');
const path = require('node:path');

const modelPath = process.argv[2];
if (!modelPath) throw new Error('Pass the compiled bracket-model.js path.');
const model = require(path.resolve(modelPath));

function participants(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `Player ${index + 1}` }));
}

function baseDraft(format, entrants) {
  return {
    version: 2,
    title: 'Smoke Test',
    format,
    seedingMode: 'manual',
    participants: entrants,
    firstRound: [],
    winners: {},
    threeWinners: {},
    entrantMode: 'player',
    tieBreakMode: 'HEAD_TO_HEAD_THEN_SEED',
  };
}

function settleExpanded(draft, choose) {
  for (let pass = 0; pass < 200; pass += 1) {
    let changed = false;
    const resolved = model.deriveExpandedCompetitionMatches(draft);
    for (const match of resolved) {
      if (!match.active || draft.winners[match.id] || !match.aReady || !match.bReady || !match.a || !match.b) continue;
      const winner = choose(match, resolved, draft);
      assert.ok(winner && (winner.id === match.a.id || winner.id === match.b.id), `invalid chooser result for ${match.id}`);
      draft.winners[match.id] = winner.id;
      changed = true;
    }
    if (!changed) return model.deriveExpandedCompetitionMatches(draft);
  }
  throw new Error('Expanded competition did not settle within 200 passes.');
}

function testRoundRobin() {
  for (let count = 2; count <= 10; count += 1) {
    const entrants = participants(count);
    const specs = model.buildRoundRobinCompetition(entrants);
    const pairs = specs.map((spec) => {
      assert.equal(spec.a.type, 'participant');
      assert.equal(spec.b.type, 'participant');
      return [spec.a.participantId, spec.b.participantId].sort().join(':');
    });
    assert.equal(specs.length, count * (count - 1) / 2, `round robin count for ${count}`);
    assert.equal(new Set(pairs).size, pairs.length, `round robin duplicates for ${count}`);

    const draft = { ...baseDraft('round_robin', entrants), competitionMatches: specs };
    settleExpanded(draft, (match) => match.a);
    const standings = model.deriveCompetitionStandings(draft);
    assert.equal(standings.complete, true, `round robin completion for ${count}`);
    assert.ok(model.bracketChampion(draft), `round robin champion for ${count}`);
  }
}

function testGroups() {
  for (const setup of [
    { entrants: 4, groups: 2, advancers: 2 },
    { entrants: 6, groups: 3, advancers: 2 },
    { entrants: 7, groups: 3, advancers: 2 },
    { entrants: 10, groups: 4, advancers: 2 },
  ]) {
    const entrants = participants(setup.entrants);
    const generated = model.buildGroupsPlayoffCompetition(entrants, setup.groups, setup.advancers);
    const draft = {
      ...baseDraft('groups', entrants),
      groups: generated.groups,
      groupAdvancers: generated.advancers,
      competitionMatches: generated.matches,
    };

    // Finish group play first so qualifier slots become concrete.
    for (const spec of generated.matches.filter((match) => match.stage === 'group')) {
      assert.equal(spec.a.type, 'participant');
      assert.equal(spec.b.type, 'participant');
      draft.winners[spec.id] = spec.a.participantId;
    }

    const firstPlayoff = generated.matches.filter((match) => match.stage === 'playoff' && match.round === 1);
    for (const match of firstPlayoff) {
      if (match.a.type === 'group_rank' && match.b.type === 'group_rank') {
        assert.notEqual(match.a.group, match.b.group, `avoidable same-group first playoff pairing in ${setup.entrants}/${setup.groups}`);
      }
    }

    settleExpanded(draft, (match) => match.a);
    assert.ok(model.bracketChampion(draft), `groups champion for ${JSON.stringify(setup)}`);
  }
}

function testDoubleElimination() {
  for (let count = 2; count <= 10; count += 1) {
    const entrants = participants(count);
    const draft = {
      ...baseDraft('double', entrants),
      competitionMatches: model.buildDoubleEliminationCompetition(entrants),
    };

    // Pick side A everywhere, including GF1. That must produce a champion without requiring GF2.
    settleExpanded(draft, (match) => match.a);
    const resolved = model.deriveExpandedCompetitionMatches(draft);
    const reset = resolved.find((match) => match.id === 'gf-2');
    assert.ok(reset, `reset match exists for ${count}`);
    assert.equal(reset.active, false, `reset should stay inactive for ${count}`);
    assert.ok(model.bracketChampion(draft), `double-elimination champion for ${count}`);
  }

  // Force the lower-bracket finalist to win GF1. GF2 must activate, then decide the champion.
  const entrants = participants(8);
  const draft = {
    ...baseDraft('double', entrants),
    competitionMatches: model.buildDoubleEliminationCompetition(entrants),
  };
  settleExpanded(draft, (match) => {
    if (match.id === 'gf-1') return match.b;
    if (match.id === 'gf-2') return match.b;
    return match.a;
  });
  const resolved = model.deriveExpandedCompetitionMatches(draft);
  const reset = resolved.find((match) => match.id === 'gf-2');
  assert.equal(reset?.active, true, 'GF reset activates after lower finalist wins GF1');
  assert.ok(reset?.winner, 'GF reset receives a winner');
  assert.equal(model.bracketChampion(draft)?.id, reset.winner.id, 'reset winner is champion');
}

function testLegacyFormats() {
  const entrants = participants(5);
  const draft = {
    ...baseDraft('single', entrants),
    firstRound: model.buildFirstRound(entrants),
  };
  for (let pass = 0; pass < 20 && !model.bracketChampion(draft); pass += 1) {
    for (const round of model.deriveSingleElimination(draft.firstRound, draft.winners)) {
      for (const match of round) {
        if (!match.winner && match.a && match.b && match.aReady && match.bReady) draft.winners[match.id] = match.a.id;
      }
    }
  }
  assert.ok(model.bracketChampion(draft), 'single-elimination non-power-of-two still resolves');

  const three = participants(3);
  const threeDraft = {
    ...baseDraft('three', three),
    participants: three,
    threeWinners: { m1: three[0].id, m2: three[2].id, m3: three[0].id },
  };
  assert.equal(model.bracketChampion(threeDraft)?.id, three[0].id, 'three-player rule regression');
}

testRoundRobin();
testGroups();
testDoubleElimination();
testLegacyFormats();
console.log('v0.7 competition smoke tests passed');
