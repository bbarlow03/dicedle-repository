// Runs against an in-memory PGlite instance only; never point this at Supabase.
async function runDicedleBonusSqlTests(PGlite, schema, migration) {
  const db = new PGlite();
  const results = []; let assertions = 0, userCounter = 0;
  let phase = "bootstrap";
  const assert = (value, message) => { assertions++; if (!value) throw new Error(message); };
  const test = async (name, callback) => {
    try { await callback(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  };
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('sub', auth.uid(), 'email_verified', true);
      $$;
    `);
    phase = "schema";
    await db.exec(schema);
    phase = "migration";
    await db.exec(migration);
    phase = "checks";
    const today = (await db.query("select current_date::text as date")).rows[0].date;
    const freshUser = async () => {
      const id = "00000000-0000-0000-0000-" + String(++userCounter).padStart(12, "0");
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1::uuid,$2,now())", [id, "fixture" + userCounter + "@example.invalid"]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      return id;
    };
    const make = (rolls, extra = {}) => ({ date: today, rolls, scoringVersion: 2, bonusStart: 0, ...extra });
    const save = async (id, run, record = null, importing = false) =>
      (await db.query("select public.save_dicedle_run($1::date,$2::jsonb,$3::jsonb,$4::boolean,$5::uuid) as saved",
        [run?.date || record.date, run ? JSON.stringify(run) : null, record ? JSON.stringify(record) : null, importing, id])).rows[0].saved;
    const rejects = async callback => { try { await callback(); return false; } catch { return true; } };

    await test("The upgrade exposes scoring version two", async () => {
      assert((await db.query("select public.dicedle_scoring_version() as version")).rows[0].version === 2, "Wrong capability version");
    });
    await test("Server scores double-then-ten as 6 plus 20", async () => {
      const id = await freshUser();
      let row = await save(id, make([[3,3]]));
      assert(row.record.score === 6, "First double boosted");
      row = await save(id, make([[3,3],[4,6]]));
      assert(row.record.score === 26 && row.record.scoringVersion === 2 && row.record.bonusStart === 0, "Wrong 2x score or metadata");
    });
    await test("Server and browser agree on every step of a stacked chain", async () => {
      const id = await freshUser(), pairs = [[1,1],[2,2],[3,3],[4,4],[4,6],[2,3]];
      for (let length=1;length<=pairs.length;length++) {
        const run = make(pairs.slice(0,length));
        const row = await save(id,run);
        assert(row.record.score === DicedleScoring.analyze(run).total, "Server/client disagreement at " + length);
      }
      assert((await save(id,make(pairs))).record.score === 263, "Cashout did not reset");
    });
    await test("A boosted seven scores 28 and finalizes the run", async () => {
      const id = await freshUser(), run = make([[1,1],[2,2],[3,4]]);
      const row = await save(id,run);
      assert(row.record.score === 38 && row.record.outcome === "busted", "Boosted bust wrong");
      assert(await rejects(()=>save(id,make([...run.rolls,[6,6]]))), "Roll after seven accepted");
      assert((await save(id,run)).record.score === 38, "Final score changed on retry");
    });
    await test("Legacy prefixes keep their old points when upgrading", async () => {
      const id=await freshUser(), old={date:today,rolls:[[1,1],[2,2],[3,3]]};
      assert((await save(id,old)).record.score===12,"Legacy totals changed");
      const upgraded=make([...old.rolls,[4,4]],{bonusStart:3});
      assert((await save(id,upgraded)).record.score===28,"Upgrade boundary ignored");
      upgraded.rolls.push([5,5],[4,6]);
      assert((await save(id,upgraded)).record.score===148,"New chain wrong after upgrade");
    });
    await test("Clients cannot downgrade modern rules or move their start boundary", async () => {
      const id=await freshUser(), run=make([[1,1],[4,6]]);
      await save(id,run);
      const downgrade={date:today,rolls:[...run.rolls,[2,3]]};
      assert((await save(id,downgrade)).run.rolls.length===2,"Scoring downgrade accepted");
      const moved=make([...run.rolls,[2,3]],{bonusStart:1});
      assert((await save(id,moved)).run.bonusStart===0,"Scoring boundary rewritten");
    });
    await test("Stale dice prefixes return the canonical saved run", async () => {
      const id=await freshUser();await save(id,make([[3,3]]));
      const row=await save(id,make([[1,1],[4,6]]));
      assert(row.record.score===6&&row.run.rolls.length===1,"Conflicting prefix accepted");
    });
    await test("A legacy run cannot retroactively gain multipliers", async () => {
      const id=await freshUser(), old={date:today,rolls:[[1,1],[2,2]]};await save(id,old);
      const row=await save(id,make([...old.rolls,[4,6]]));
      assert(row.run.rolls.length===2&&row.record.score===6,"Legacy rolls rescored retroactively");
    });
    await test("Reapplying the migration preserves finalized historical scores", async () => {
      const id=await freshUser();await save(id,{date:today,rolls:[[1,1],[3,4]]});
      await db.exec(migration);
      const row=(await db.query("select record from public.dicedle_runs where user_id=$1::uuid",[id])).rows[0];
      assert(row.record.score===9&&row.record.outcome==="busted","Migration rewrote history");
    });
    await test("Bonus history imports accept boosted totals without widening legacy limits", async () => {
      const id=await freshUser();
      const record={version:1,id:today,date:today,mode:"daily",score:258,rollCount:5,outcome:"day-ended",recordedAt:1,scoringVersion:2,bonusStart:0};
      assert((await save(id,null,record,true)).record.score===258,"Bonus history rejected");
      const other=await freshUser(),legacy={...record};delete legacy.scoringVersion;delete legacy.bonusStart;
      assert(await rejects(()=>save(other,null,legacy,true)),"Legacy bound widened");
    });
    await test("Malformed rules and unsafe totals are rejected", async () => {
      const id=await freshUser();
      for(const extra of [{scoringVersion:3},{bonusStart:-1},{bonusStart:1.5},{bonusStart:2},{bonusStart:null}]) {
        assert(await rejects(()=>save(id,make([[1,1]],extra))),"Malformed scoring metadata accepted");
      }
      assert(await rejects(()=>save(id,make(Array.from({length:54},()=>[6,6])))),"Unsafe total accepted");
    });
    await test("A stale account identity cannot save a run", async () => {
      const owner=await freshUser(),other="00000000-0000-0000-0000-999999999999";
      assert(await rejects(()=>save(other,make([[1,1]]))),"Identity mismatch accepted");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
      assert(await rejects(()=>save(owner,make([[1,1]]))),"Anonymous write accepted");
    });
    await test("Row policies isolate owners and deny direct writes", async () => {
      const owner=await freshUser();await save(owner,make([[1,1]]));
      await freshUser();
      await db.exec("set role authenticated");
      try {
        assert((await db.query("select * from public.dicedle_runs where user_id=$1::uuid",[owner])).rows.length===0,"Another player's run visible");
        assert(await rejects(()=>db.query("delete from public.dicedle_runs where user_id=$1::uuid",[owner])),"Direct delete allowed");
      } finally { await db.exec("reset role"); }
    });
    return { results, assertions, failed: results.filter(result=>!result.passed).length };
  } catch (error) {
    error.message = `${phase}: ${error.message}${error.position ? ` (position ${error.position})` : ""}${error.where ? ` ${error.where}` : ""}`;
    throw error;
  } finally { await db.close(); }
}
