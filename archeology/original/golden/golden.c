/*
 * golden.c - headless runs of the original game, dumping the state at each frame.
 *
 * Part of the xblast-port project (GPL-2.0-or-later). Included at the end of
 * xblast.c by the Dockerfile; enabled by XBLAST_GOLDEN=<output dir>:
 *   XBLAST_GOLDEN_RUNS   number of games (default 5), one level each
 *   XBLAST_GOLDEN_SEED   seed of the first game (default 1), +1 per game
 *   XBLAST_GOLDEN_BOMB   chance per frame that a player drops a bomb, per mille (default 20)
 *   XBLAST_GOLDEN_SPECIAL chance per frame that a player presses the special key, per mille (default 10)
 *   XBLAST_GOLDEN_LEVELS comma separated level names (default: the game level order)
 *
 * Players are "monkeys": pseudo-random inputs from their own generator, so the
 * game random generator (GameRandomNumber) is only used by the game rules.
 * Output: one JSON Lines file per game; line 1 is metadata, then one line per
 * frame (frame 0 = after level setup). Frame t = state after GameTurn (t), and
 * the inputs then applied by GameEvalAction; GameUpdateWindow ends the frame.
 */

#include <stdio.h>
#include <stdlib.h>

extern int i97, j97;
extern double c;
extern Explosion *exploList;

static unsigned monkeyRand;

static unsigned
MonkeyRandom (unsigned maxVal)
{
	monkeyRand = monkeyRand * 1103515245u + 12345u;
	return (monkeyRand >> 16) % maxVal;
}

/* JSON string: escapes quotes, backslashes and control characters */
static void
GoldenString (FILE * out, const char *s)
{
	fputc ('"', out);
	for (; s != NULL && *s != '\0'; s++) {
		if (*s == '"' || *s == '\\') {
			fprintf (out, "\\%c", *s);
		}
		else if ((unsigned char)*s < 0x20) {
			fprintf (out, "\\u%04x", (unsigned char)*s);
		}
		else {
			fputc (*s, out);
		}
	}
	fputc ('"', out);
}

static int
EnvInt (const char *name, int def)
{
	const char *value = getenv (name);
	return value ? atoi (value) : def;
}

static void
GoldenPlayerFields (FILE * out)
{
	fputs ("[\"x\",\"y\",\"d_soll\",\"d_ist\",\"d_look\",\"invincible\",\"dying\",\"stunned\",\"health\","
		   "\"illness\",\"speed\",\"illtime\",\"junkie\",\"lives\",\"stop\",\"evilill\",\"range\",\"bombs\","
		   "\"special_bombs\",\"choice_bomb_type\",\"remote_control\",\"kick\",\"teleport\",\"cloaking\","
		   "\"num_extras\",\"in_active\",\"ghost\",\"through\",\"throughCount\",\"phantom\",\"electrify\","
		   "\"revive\",\"frogger\",\"morphed\",\"num_morph\",\"air_button\",\"jump_button\",\"suck_button\","
		   "\"daleif\",\"daleifing\",\"farted\",\"farter\",\"bfarter\",\"smelly\",\"num_snipe\",\"sniping\","
		   "\"iniextra_flags\",\"revextra_flags\"]", out);
}

static void
GoldenPlayer (FILE * out, const BMPlayer * p)
{
	fprintf (out, "[%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,"
			 "%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%u,%u]",
			 p->x, p->y, p->d_soll, p->d_ist, p->d_look, p->invincible, p->dying, p->stunned,
			 p->health, p->illness, p->speed, p->illtime, p->junkie, p->lives, p->stop, p->evilill,
			 p->range, p->bombs, p->special_bombs, p->choice_bomb_type, p->remote_control, p->kick,
			 p->teleport, p->cloaking, p->num_extras, p->in_active, p->ghost, p->through,
			 p->throughCount, p->phantom, p->electrify, p->revive, p->frogger, p->morphed,
			 p->num_morph, p->air_button, p->jump_button, p->suck_button, p->daleif, p->daleifing,
			 p->farted, p->farter, p->bfarter, p->smelly, p->num_snipe, p->sniping,
			 p->iniextra_flags, p->revextra_flags);
}

static void
GoldenBombFields (FILE * out)
{
	fputs ("[\"owner\",\"x\",\"y\",\"dx\",\"dy\",\"range\",\"dir\",\"malfunction\",\"count\",\"countslower\","
		   "\"countslower2\",\"blink\",\"type\",\"typeExtr\",\"burnOut\",\"isMorphed\",\"isSniping\","
		   "\"stop\",\"jump\"]", out);
}

static void
GoldenBomb (FILE * out, const Explosion * e)
{
	fprintf (out, "[%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d]",
			 e->player ? (int)(e->player - player_stat) : -1, e->x, e->y, e->dx, e->dy, e->range,
			 e->dir, e->malfunction, e->count, e->countslower, e->countslower2, e->blink, e->type,
			 e->typeExtr, e->burnOut, e->isMorphed, e->isSniping, e->stop, e->jump);
}

static void
GoldenFrame (FILE * out, int gameTime, int numPlayer, const PlayerAction * pa)
{
	int i;
	const Explosion *e;

	fprintf (out, "{\"t\":%d,\"rng\":[%d,%d,\"%a\"],\"actions\":[", gameTime, i97, j97, c);
	for (i = 0; i < numPlayer; i++) {
		fprintf (out, "%s[%d,%d,%d]", i ? "," : "", pa[i].dir, pa[i].bomb, pa[i].special);
	}
	fputs ("],\"players\":[", out);
	for (i = 0; i < numPlayer; i++) {
		if (i) {
			fputc (',', out);
		}
		GoldenPlayer (out, player_stat + i);
	}
	fputs ("],\"bombs\":[", out);
	for (e = exploList, i = 0; e != NULL; e = e->next, i++) {
		if (i) {
			fputc (',', out);
		}
		GoldenBomb (out, e);
	}
	fputs ("],", out);
	GoldenDumpMap (out);
	fputs ("}\n", out);
}

static void
MonkeyActions (int numPlayer, PlayerAction * pa, int *hold, BMDirection * dir, int bombPerMille,
			   int specialPerMille)
{
	static const BMDirection dirs[] = { GoStop, GoUp, GoLeft, GoDown, GoRight };
	int i;

	ClearPlayerAction (pa);
	for (i = 0; i < numPlayer; i++) {
		if (--hold[i] <= 0) {
			hold[i] = 1 + (int)MonkeyRandom (16);
			dir[i] = dirs[MonkeyRandom (5)];
			pa[i].dir = dir[i];
		}
		pa[i].bomb = MonkeyRandom (1000) < (unsigned)bombPerMille;
		pa[i].special = MonkeyRandom (1000) < (unsigned)specialPerMille;
	}
}

void
RunGoldenGame (const char *outDir)
{
	static CFGGame game;
	static PlayerAction action[MAX_PLAYER];
	int hold[MAX_PLAYER];
	BMDirection dir[MAX_PLAYER];
	int runs = EnvInt ("XBLAST_GOLDEN_RUNS", 5);
	int seed = EnvInt ("XBLAST_GOLDEN_SEED", 1);
	int bombPerMille = EnvInt ("XBLAST_GOLDEN_BOMB", 20);
	int specialPerMille = EnvInt ("XBLAST_GOLDEN_SPECIAL", 10);
	int run, i, gameTime, numActive;
	char path[1024];
	XBAtom atom;
	const DBRoot *level;
	const char *levels;
	FILE *out;

	if (!RetrieveGame (CT_Local, atomLocal, &game) || !InitLevels (&game) ||
		!InitGame (XBPH_Local, CT_Local, &game, action)) {
		fprintf (stderr, "golden: cannot init the local game (see config/game.cfg)\n");
		return;
	}
	levels = getenv ("XBLAST_GOLDEN_LEVELS");
	for (run = 0; run < runs; run++, seed++) {
		if (NULL != levels && '\0' != *levels) {
			/* next name of the comma separated list, cycling */
			const char *end = strchr (levels, ',');
			size_t len = end ? (size_t)(end - levels) : strlen (levels);
			char name[256];
			snprintf (name, sizeof (name), "%.*s", (int)len, levels);
			atom = GUI_StringToAtom (name);
			levels = end ? end + 1 : getenv ("XBLAST_GOLDEN_LEVELS");
		}
		else {
			atom = GetNextLevel ();
		}
		if (NULL == (level = LoadLevelFile (atom))) {
			fprintf (stderr, "golden: cannot load level %s\n", GUI_AtomToString (atom));
			continue;
		}
		snprintf (path, sizeof (path), "%s/%s-seed%d.jsonl", outDir, GUI_AtomToString (atom), seed);
		if (NULL == (out = fopen (path, "w"))) {
			fprintf (stderr, "golden: cannot write %s\n", path);
			return;
		}
		/* same order as LocalRunLevel: seed, then level setup */
		SeedRandom ((unsigned)seed);
		if (!ConfigLevel (level)) {
			fclose (out);
			continue;
		}
		fputs ("{\"version\":1,\"level\":", out);
		GoldenString (out, GUI_AtomToString (atom));
		fputs (",\"name\":", out);
		GoldenString (out, GetLevelName (level));
		fprintf (out, ",\"seed\":%d,\"players\":%d,\"gameTime\":%d,\"bombPerMille\":%d,\"specialPerMille\":%d,"
				 "\"playerFields\":", seed, game.players.num, GAME_TIME, bombPerMille, specialPerMille);
		GoldenPlayerFields (out);
		fputs (",\"bombFields\":", out);
		GoldenBombFields (out);
		fputs ("}\n", out);
		monkeyRand = (unsigned)seed;
		for (i = 0; i < MAX_PLAYER; i++) {
			hold[i] = 0;
			dir[i] = GoStop;
		}
		ClearPlayerAction (action);
		GoldenFrame (out, 0, game.players.num, action);
		numActive = game.players.num;
		gameTime = 0;
		/* same frame as LocalRunLevel, without display and input events */
		do {
			gameTime++;
			GameTurn (gameTime, game.players.num, &numActive);
			MonkeyActions (game.players.num, action, hold, dir, bombPerMille, specialPerMille);
			GoldenFrame (out, gameTime, game.players.num, action);
			(void)GameEvalAction (game.players.num, action);
			/* also clears the explosion map for the next frame */
			GameUpdateWindow ();
		} while (gameTime < GAME_TIME &&
				 numActive > 0 && (numActive > 1 || NumberOfExplosions () != 0));
		fclose (out);
		fprintf (stderr, "golden: %s (%d frames)\n", path, gameTime);
		FinishLevel ();
		DeleteAllExplosions ();
	}
	FinishGame (&game);
}
