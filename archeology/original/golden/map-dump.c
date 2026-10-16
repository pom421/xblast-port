
/*
 * Appended to map.c by the Dockerfile (xblast-port golden runs): dumps the
 * maze, the extras and the explosion maps, one character per cell (column major).
 */
void
GoldenDumpMap (FILE * out)
{
	int x, y;

	fputs ("\"maze\":\"", out);
	for (x = 0; x < MAZE_W; x++) {
		for (y = 0; y < MAZE_H; y++) {
			fputc ('A' + (int)maze[x][y], out);
		}
	}
	fputs ("\",\"extra\":\"", out);
	for (x = 0; x < MAZE_W; x++) {
		for (y = 0; y < MAZE_H; y++) {
			fputc ('A' + (int)extra[x][y], out);
		}
	}
	fputs ("\",\"expl\":[", out);
	for (x = 0; x < MAZE_W; x++) {
		for (y = 0; y < MAZE_H; y++) {
			fprintf (out, "%s%u", (x || y) ? "," : "", (unsigned)explMaze[x][y]);
		}
	}
	fputc (']', out);
}
