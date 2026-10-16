# Original XBlast 2.10.4 (X11 build), playable in a browser through noVNC.
# Reference implementation for the port: see archeology/README.md.

FROM debian:trixie AS build
RUN sed -i 's/^Types: deb$/Types: deb deb-src/' /etc/apt/sources.list.d/debian.sources \
 && apt-get update \
 && apt-get build-dep -y xblast-tnt \
 && apt-get install -y --no-install-recommends dpkg-dev
WORKDIR /src
# Debian source package: upstream 2.10.4 tarball + patches for modern gcc.
RUN apt-get source xblast-tnt && mv xblast-tnt-*/ xblast
WORKDIR /src/xblast
# 2006 autotools scripts do not know aarch64: use current ones (as Debian does).
RUN cp /usr/share/misc/config.sub /usr/share/misc/config.guess .
# Same flags as Debian, without the sound server (no audio in the container).
RUN ./configure --with-x --disable-nls --disable-sound --disable-mini --disable-SMPF \
      --with-otherdatadir=/usr/share/games/xblast-tnt \
 && make -j"$(nproc)"

# Same build, plus the headless "golden" mode (golden/golden.c): XBLAST_GOLDEN=<dir>
FROM build AS golden
COPY golden/ /src/golden/
RUN cat /src/golden/map-dump.c >> map.c \
 && sed -i 's|^\t/\* Call intro \*/|\t{ extern void RunGoldenGame (const char *); const char *dir = getenv ("XBLAST_GOLDEN"); if (dir) { RunGoldenGame (dir); GUI_Finish (); Finish (); return 0; } }\n&|' xblast.c \
 && printf '\n#include "/src/golden/golden.c"\n' >> xblast.c \
 && sed -i 's|^extern void DrawMaze|extern void GoldenDumpMap (FILE *);\n&|' map.h \
 && grep -q RunGoldenGame xblast.c && grep -q GoldenDumpMap map.h \
 && make -j"$(nproc)"

FROM debian:trixie
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libx11-6 libxt6t64 \
      xblast-tnt-images xblast-tnt-levels xblast-tnt-models \
      xfonts-base xfonts-75dpi xfonts-100dpi \
      xvfb x11vnc novnc websockify \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/xblast/xblast /usr/games/xblast
COPY --from=golden /src/xblast/xblast /usr/games/xblast-golden
COPY entrypoint.sh /entrypoint.sh
EXPOSE 6080
ENTRYPOINT ["/entrypoint.sh"]
