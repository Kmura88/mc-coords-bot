CUB = cubiomes
SRC = native/mapgen.c $(CUB)/noise.c $(CUB)/biomes.c $(CUB)/layers.c $(CUB)/biomenoise.c \
      $(CUB)/generator.c $(CUB)/finders.c $(CUB)/util.c $(CUB)/quadbase.c

libmapgen.so: $(SRC)
	gcc -O3 -fPIC -shared -fwrapv -I$(CUB) -o $@ $(SRC) -lm

clean:
	rm -f libmapgen.so
