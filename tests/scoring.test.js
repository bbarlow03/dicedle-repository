(async () => {
  const TODAY = "2026-10-30", NOW = Date.UTC(2026, 9, 30, 12);
  const results = []; let assertions = 0;
  const assert = (value, message) => { assertions++; if (!value) throw new Error(message); };
  const test = async (name, callback) => {
    try { await callback(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  };
  const modern = rolls => ({ date: TODAY, rolls, scoringVersion: 2, bonusStart: 0 });
  const analyze = rolls => DicedleScoring.analyze(modern(rolls));
  class MemoryStorage {
    constructor() { this.values = new Map(); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
  }
  const fixture = () => {
    const memory = new MemoryStorage();
    const storage = new DicedleStorage(() => memory);
    const history = new DicedleHistory(() => storage, { now: () => NOW });
    return { memory, storage, history };
  };
  const response = run => {
    const h = fixture().history;
    return { run, run_date: run.date, record: h.summarize(run, TODAY) };
  };
  const client = handler => {
    const account = Object.create(DicedleAccounts.prototype);
    Object.assign(account, {
      revision: 1, user: { id: "test-player" }, doublesScoringReady: false, applied: 0,
      storage: fixture().storage, client: { rpc: handler },
      applyRow() { this.applied++; }, render() {},
    });
    return account;
  };

  await test("A double arms the following roll, not its own score", () => {
    const score = analyze([[3,3]]);
    assert(score.total === 6 && score.rolls[0].multiplier === 1, "Initial double was boosted");
    assert(score.nextMultiplier === 2 && score.pending, "Double did not arm fire");
  });

  await test("The requested double-then-ten example scores twenty on the next roll", () => {
    const score = analyze([[3,3],[4,6]]);
    assert(score.total === 26, "Wrong total for 6 + 20");
    assert(score.rolls[1].points === 20 && score.rolls[1].bonus === 10, "Wrong awarded points");
    assert(score.nextMultiplier === 1 && !score.pending, "Non-double did not consume multiplier");
  });

  await test("Consecutive doubles raise the next multiplier to 2, 4, 8, and 16", () => {
    const rolls = [[1,1],[2,2],[3,3],[4,4]];
    [2,4,8,16].forEach((expected, index) => {
      const score = analyze(rolls.slice(0,index+1));
      assert(score.nextMultiplier === expected, "Broken chain at " + expected);
    });
    const score = analyze([...rolls,[4,6]]);
    assert(score.total === 258, "Wrong cumulative chain score");
    assert(JSON.stringify(score.rolls.map(roll=>roll.points)) === "[2,8,24,64,160]", "Wrong chain payouts");
    assert(score.nextMultiplier === 1, "Cashout did not reset");
  });

  await test("The roll after a non-double cashout returns to ordinary points", () => {
    const score = analyze([[1,1],[2,2],[4,6],[2,3]]);
    assert(score.rolls[2].points === 40, "4x cashout missed");
    assert(score.rolls[3].points === 5 && score.nextMultiplier === 1, "Bonus persisted after cashout");
  });

  await test("A new double after cashout starts a fresh 2x chain", () => {
    const score = analyze([[1,1],[4,6],[2,2]]);
    assert(score.rolls[2].points === 4 && score.nextMultiplier === 2, "Old multiplier reused");
  });

  await test("A seven collects the current multiplier and still ends the run", () => {
    const f=fixture(), run=modern([[1,1],[2,2],[3,4]]);
    const score=DicedleScoring.analyze(run), record=f.history.summarize(run,TODAY);
    assert(score.total===38 && score.rolls[2].points===28,"Four-times seven not awarded");
    assert(record.score===38 && record.outcome==="busted","Boosted seven did not bust");
    assert(score.nextMultiplier===1&&!score.pending,"Busted run kept fire");
    assert(!f.history.validRun(modern([...run.rolls,[6,6]])),"Run continued after bust");
  });

  await test("Non-double rolls and an empty run keep ordinary scoring", () => {
    assert(analyze([]).total===0&&analyze([]).nextMultiplier===1,"Empty run armed a bonus");
    assert(analyze([[2,3],[4,6],[3,4]]).total===22,"Ordinary totals changed");
  });

  await test("Legacy scores are never retroactively multiplied", () => {
    const run={date:TODAY,rolls:[[1,1],[2,2],[3,3]]};
    assert(DicedleScoring.analyze(run).total===12,"Legacy score changed");
    assert(DicedleScoring.analyze(run).nextMultiplier===2,"Only last legacy double should arm the new rule");
    const upgraded={...run,...DicedleScoring.nextRules(run),rolls:[...run.rolls,[4,6]]};
    assert(upgraded.bonusStart===3&&DicedleScoring.analyze(upgraded).total===32,"Wrong upgrade boundary");
  });

  await test("An upgraded legacy run stacks only doubles rolled under the new rules", () => {
    const score=DicedleScoring.analyze({date:TODAY,scoringVersion:2,bonusStart:3,
      rolls:[[1,1],[2,2],[3,3],[4,4],[5,5],[4,6]]});
    assert(score.total===148,"Old doubles were included in the chain");
    assert(JSON.stringify(score.rolls.map(roll=>roll.points))==="[2,4,6,16,40,80]","Wrong mixed-rule payouts");
  });

  await test("Rules survive JSON storage without storing a mutable multiplier", () => {
    const run=modern([[1,1],[2,2],[3,3],[4,4]]);
    const restored=JSON.parse(JSON.stringify(run));
    assert(DicedleScoring.analyze(restored).nextMultiplier===16,"Saved chain was lost");
    assert(!("multiplier" in restored),"Mutable multiplier stored");
  });

  await test("Malformed or unknown scoring metadata is rejected", () => {
    const history=fixture().history;
    for(const bad of [
      {scoringVersion:2},{scoringVersion:2,bonusStart:-1},{scoringVersion:2,bonusStart:1.5},
      {scoringVersion:2,bonusStart:2},{scoringVersion:3,bonusStart:0},{bonusStart:0},
    ]) assert(!history.validRun({date:TODAY,rolls:[[1,1]],...bad}),"Invalid rules accepted");
  });

  await test("History, average scores and lifetime totals include all bonus points", () => {
    const f=fixture(),run=modern([[1,1],[2,2],[3,4]]);
    f.storage.setItem(f.history.runKey,JSON.stringify(run));
    const data=f.history.profile(TODAY);
    assert(data.currentRun.scoringVersion===2&&data.stats.totalScore===38,"Current/lifetime bonus total wrong");
    assert(data.stats.averageScore===38&&data.stats.completedRuns===1,"Finished average wrong");
    const saved=f.history.records()[0];
    assert(saved.score===38&&saved.scoringVersion===2&&saved.bonusStart===0,"History lost rules");
    assert(f.history.recordRun(saved)?.rolls.length===3,"Boosted raw history did not validate");
  });

  await test("High bonus records are valid without relaxing classic record bounds", () => {
    const f=fixture(),run=modern([[1,1],[2,2],[3,3],[4,4],[4,6],[3,4]]);
    const record=f.history.summarize(run,TODAY);
    assert(record.score===265&&f.history.validRecord(record),"High bonus record rejected");
    const classic={...record};delete classic.scoringVersion;delete classic.bonusStart;
    assert(!f.history.validRecord(classic),"Classic bounds were widened");
  });

  await test("Boosted raw dice still unlock dice-pattern and score achievements", async () => {
    const f=fixture(),run=modern([[1,1],[2,2],[3,3],[4,4],[5,5],[6,6]]);
    f.storage.setItem(f.history.runKey,JSON.stringify(run));
    const book=new DicedleAchievements(()=>f.storage,{now:()=>NOW,locks:null});
    const snapshot=await book.collect(f.history.profile(TODAY));
    assert(snapshot.unlocked.has("all-doubles")&&snapshot.unlocked.has("run-score-500"),"Bonus achievements missed");
    assert(snapshot.metrics.lifetimePoints===642&&snapshot.metrics.totalDoubles===6,"Bonus totals or dice details lost");
  });

  await test("An older scoring server is detected before any run is written", async () => {
    const calls=[];
    const account=client(async name=>{calls.push(name);return {data:null,error:new Error("missing")};});
    let failed=false;try{await account.saveRun(modern([[1,1]]));}catch(error){failed=error.code==="SCORING_UPDATE_REQUIRED";}
    assert(failed&&calls.length===1&&calls[0]==="dicedle_scoring_version","Unupgraded server got a scoring write");
    assert(account.applied===0,"Unconfirmed data applied");
  });

  await test("The server capability check is cached after a successful account save", async () => {
    const calls=[],run=modern([[1,1],[4,6]]);
    const account=client(async name=>{calls.push(name);return {data:name==="dicedle_scoring_version"?2:response(run),error:null};});
    await account.saveRun(run);await account.saveRun(run);
    assert(calls.filter(name=>name==="dicedle_scoring_version").length===1,"Repeated capability request");
    assert(account.applied===2,"Confirmed runs not applied");
  });

  await test("An incorrect server bonus total is never accepted as a confirmed score", async () => {
    const run=modern([[1,1],[4,6]]), row=response(run);row.record.score=12;
    const account=client(async name=>({data:name==="dicedle_scoring_version"?2:row,error:null}));
    let rejected=false;try{await account.saveRun(run);}catch{rejected=true;}
    assert(rejected&&account.applied===0,"Incorrect account bonus score accepted");
  });

  await test("Changing accounts during capability checking cannot write to the new account", async () => {
    let resolve;
    const pending=new Promise(done=>{resolve=done;});
    const account=client(()=>pending);
    const saving=account.saveRun(modern([[1,1]]));
    account.revision++;resolve({data:2,error:null});
    let rejected=false;try{await saving;}catch{rejected=true;}
    assert(rejected&&!account.doublesScoringReady&&account.applied===0,"Stale account capability response used");
  });

  const failed=results.filter(result=>!result.passed);
  document.querySelector("#results").textContent=results.map(result=>
    `${result.passed?"PASS":"FAIL"} ${result.name}${result.error?": "+result.error:""}`).join("\n")
    +`\n\n${results.length-failed.length}/${results.length} checks passed; ${assertions} assertions.`;
  window.dicedleScoringTestResults={results,assertions,failed:failed.length};
  window.dicedleScoringTestsFinished=true;
})();
