#!/usr/bin/env python3
"""
Teste com SUAS coordenadas reais
"""

# Suas coordenadas
coord_x = 14222.6
coord_z = 13309.9

print("Suas coordenadas reais:")
print(f"CoordX (Leste-Oeste) = {coord_x}")
print(f"CoordZ (Sul-Norte) = {coord_z}")
print()

# Conversão SEM inverter Y
pixel_x_v1 = (coord_x / 15360.0) * 4096
pixel_y_v1 = (coord_z / 15360.0) * 4096
print(f"SEM inverter Y:")
print(f"  pixel_x = {pixel_x_v1:.0f} (coluna)")
print(f"  pixel_y = {pixel_y_v1:.0f} (linha)")
print()

# Conversão COM inverter Y
pixel_x_v2 = (coord_x / 15360.0) * 4096
pixel_y_v2 = 4096 - (coord_z / 15360.0) * 4096
print(f"COM inverter Y:")
print(f"  pixel_x = {pixel_x_v2:.0f} (coluna)")
print(f"  pixel_y = {pixel_y_v2:.0f} (linha)")
print()

# Onde você disse que apareceu
print(f"Você disse que apareceu em Y≈15367")
print(f"Isso estaria FORA do mapa (máx é 4096)")
print()

# Testar interpretações diferentes
print("Interpretações possíveis:")
print(f"1. Y sem inverter = {pixel_y_v1:.0f} (linha {(pixel_y_v1/4096)*15360:.0f}m do sul)")
print(f"2. Y invertido = {pixel_y_v2:.0f} (linha {(pixel_y_v2/4096)*15360:.0f}m do sul)")
print()
print("Range do Chernarus:")
print("  Norte (extremo) = 15360m")
print("  Centro = 7680m")
print("  Sul (extremo) = 0m")
print()
print(f"Você está em {coord_z}m do sul (ou {(coord_z/15360)*100:.0f}% do sul para o norte)")
