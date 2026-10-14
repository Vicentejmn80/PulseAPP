# -*- coding: utf-8 -*-
"""Genera el INSERT del banco Intermedio. No toca la base."""
import json
from pathlib import Path

ROWS = [
("001","¿Qué equipo venezolano ganó la Serie del Caribe de 1970?","Tiburones de La Guaira","Leones del Caracas","Navegantes del Magallanes","Tigres de Aragua","C"),
("002","¿En qué temporada ganó Cardenales de Lara su primer título de la LVBP?","1989-1990","1987-1988","1990-1991","1988-1989","C"),
("003","¿Cuál era el nombre anterior de Caribes de Anzoátegui?","Caribes de Oriente","Caribes de Guayana","Caribes de Sucre","Caribes del Caribe","A"),
("004","¿Qué figura de Cardenales es conocida como \"La Pared Negra\"?","Luis Sojo","César Tovar","Robert Pérez","Domingo Carrasquel","C"),
("005","¿Qué equipo venezolano ganó la Serie del Caribe de Miami 2024?","Tiburones de La Guaira","Leones del Caracas","Navegantes del Magallanes","Cardenales de Lara","A"),
("006","¿Cómo se llamaba Bravos inmediatamente antes de mudarse a Llaneros de Portuguesa Margarita?","Petroleros de Cabimas","Pastora de Occidente","Pastora de Los Llanos","Pastora de Los Llanos","D"),
("007","¿Qué venezolano ganó la Triple Corona de bateo de la Liga Americana en 2012?","José Altuve","Miguel Cabrera","Carlos González","Magglio Ordóñez","B"),
("008","¿Con qué equipo ganó Johan Santana sus dos premios Cy Young?","Marineros de Seattle","Mets de Nueva York","Mellizos de Minnesota","Medias Blancas de Chicago","C"),
("009","¿Qué venezolano inauguró el club 40 jonrones-70 robos de MLB?","José Altuve","Ronald Acuña Jr.","Bob Abreu","Carlos González","B"),
("010","¿Qué venezolano fue el MVP de la Serie Mundial de 2012?","Marco Scutaro","Salvador Pérez","Miguel Cabrera","Pablo Sandoval","D"),
("011","¿En qué temporada ganó Tigres de Aragua su primer campeonato?","1969-1970","1970-1971","1968-1969","1971-1972","D"),
("012","¿En qué temporada ganó Águilas del Zulia su primer campeonato?","1980-1981","1983-1984","1982-1983","1981-1982","B"),
("013","¿En qué temporada logró Caribes su primer título de la LVBP?","2008-2009","2009-2010","2007-2008","2010-2011","D"),
("014","¿En qué año conquistó Caracas su primera Serie del Caribe?","1981","1982","1980","1979","B"),
("015","¿Qué equipo venezolano ganó la Serie del Caribe de 2009?","Águilas del Zulia","Navegantes del Magallanes","Leones del Caracas","Tigres de Aragua","D"),
("016","¿Con qué nombre nació en 1991 la franquicia que hoy es Bravos?","Petroleros de Cabimas","Industriales de Valencia","Pastora de Los Llanos","Llaneros de Acariña","A"),
("017","¿En qué ciudad se fundó el Magallanes Base Ball Club en 1917?","Maracay","Valencia","Maracaibo","Caracas","D"),
("018","¿Qué dos clubes se unieron como Llaneros de Portuguesa en 1975-1976?","Leones y Tiburones","Magallanes y Tigres","Cardenales y Águilas","Tigres y Cardenales","A"),
("019","¿En qué año se disputó la primera temporada de la LVBP?","1947","1946","1945","1948","B"),
("020","¿A qué selección venció Venezuela en el juego decisivo del Mundial Amateur de 1941?","Estados Unidos","Cuba","Puerto Rico","México","B"),
("021","¿Cuál es el estadio de Magallanes en Valencia?","Antonio Herrera Gutiérrez","José Bernardo Pérez","Alfonso \"Chico\" Carrasquel","José Pérez Colmenares","B"),
("022","¿En qué año se incorporaron los Tigres de Aragua a la LVBP?","1965","1967","1962","1969","A"),
("023","¿En qué año debutaron las Águilas del Zulia en la LVBP?","1967","1965","1969","1971","C"),
("024","¿Qué equipo venezolano ganó invicto la Serie del Caribe de 2006?","Navegantes del Magallanes","Leones del Caracas","Tigres de Aragua","Cardenales de Lara","B"),
("025","¿Cuál fue el primer equipo campeón de la LVBP?","Patriotas de Venezuela","Navegantes del Magallanes","Cervecería Caracas","Sabios del Vargas","D"),
("026","¿Qué venezolano fue el MVP de la Liga Americana en 2017?","José Altuve","Miguel Cabrera","Salvador Pérez","Elvis Andrus","A"),
("027","¿Qué equipo dirigió Oswaldo Guillén al título de la Serie Mundial de 2005?","Astros de Houston","Marlins de Florida","Medias Blancas de Chicago","Medias Rojas de Boston","C"),
("028","¿Qué venezolano ganó títulos de bateo en MLB en 2022, 2023 y 2024?","Luis Arráez","Anthony Santander","José Altuve","Ronald Acuña Jr.","A"),
("029","¿En qué ciudad mexicana se coronó Tigres de Aragua en la Serie del Caribe 2009?","Mexicali","Hermosillo","Mazatlán","Culiacán","A"),
("030","¿Cuántos jonrones bateó Pablo Sandoval en el primer juego de la Serie Mundial 2012?","Dos","Cuatro","Tres","Uno","C"),
("1031","¿Quién fue el Más Valioso de la LVBP 2023-2024?","Osmer Morales","José Rondón","José Martínez","Renato Núñez","C"),
("1032","¿Quién ganó el MVP de la LVBP 2024-2025?","José Martínez","Lorenzo Cedrola","Renato Núñez","Harold Castro","C"),
("1033","¿Quién fue el Pitcher del Año de la LVBP 2023-2024?","Osmer Morales","Junior Guerra","Ricardo Pinto","Jhoulys Chacin","A"),
("1034","¿Quién ganó el Novato del Año de la LVBP 2024-2025?","Luisangel Acuña","Andrés Chaparro","Luis Matos","José Fernández","C"),
("1035","¿Qué receptor fue MVP y Novato del Año en la LVBP 2022-2023?","Freddy Fermín","Salvador Pérez","Francisco Arcia","Wilson Ramos","A"),
("1036","¿Quién conectó el jonrón que decidió el título de Leones en enero de 2023?","Gabriel Noriega","José Rondón","Oswaldo Arcia","Harold Castro","D"),
("1037","¿Quién fue el MVP de la final de la LVBP 2024-2025?","Hernán Pérez","Ildemaro Vargas","José Rondón","Rangel Ravelo","B"),
("1038","¿Quién fue el Cerrador del Año de la LVBP 2024-2025?","Ricardo Pinto","Anthony Vizcaya","Silvino Bracho","Arnaldo Hernández","C"),
("1039","¿Quién fue el Mánager del Año de la LVBP 2024-2025?","Henry Blanco","Lipso Nava","José Moreno","Oswaldo Guillén","B"),
("1040","¿Qué franquicia adquirieron los fundadores de Águilas en 1969?","Tiburones de La Guaira","Cardenales de Lara","Industriales de Valencia","Llaneros de Acariña","D"),
("1041","¿Contra quién disputó Cardenales su primer juego en la LVBP?","Tigres de Aragua","Navegantes del Magallanes","Tiburones de La Guaira","Leones del Caracas","D"),
("1042","¿Qué premio ganó Luis Aparicio en su primera temporada de MLB, en 1956?","Cy Young","Novato del Año","Triple Corona de bateo","MVP de la Serie Mundial","B"),
("1043","¿Con qué equipo ganó Luis Aparicio la Serie Mundial de 1966?","Medias Rojas de Boston","Dodgers de Los Ángeles","Medias Blancas de Chicago","Orioles de Baltimore","D"),
("1044","¿Quién fue el MVP del Juego de Estrellas de MLB de 1982?","Antonio Armas","David Concepción","Manny Trillo","Luis Aparicio","B"),
("1045","¿Qué venezolano bateó .370 para Colorado en 1993?","Bob Abreu","Magglio Ordóñez","Carlos González","Andrés Galarraga","D"),
("1046","¿Qué venezolano jugó las nueve posiciones en un partido de MLB en 1968?","César Tovar","Luis Aparicio","Gustavo Gil","Manny Trillo","A"),
("1047","¿Qué venezolano lanzó el primer no-hitter de los Mets en 2012?","Félix Hernández","Wilson Álvarez","Aníbal Sánchez","Johan Santana","D"),
("1048","¿Quién ganó el Derby de Jonrones de MLB en 2005?","Bob Abreu","Miguel Cabrera","Andrés Galarraga","Magglio Ordóñez","A"),
("1049","¿Qué venezolano fue campeón bate de la Americana en 2007?","José Altuve","Magglio Ordóñez","Miguel Cabrera","Victor Martínez","B"),
("1050","¿Quién ganó el Novato del Año de la Liga Nacional en 2018?","Luis Arráez","Ronald Acuña Jr.","Eugenio Suárez","Gleyber Torres","B"),
("1051","¿Qué venezolano fue MVP de la Serie Mundial de 2015?","Omar Infante","Salvador Pérez","Kelvim Escobar","Alcides Escobar","B"),
("1052","¿Quién fue campeón bate de la LVBP 2023-2024?","Gabriel Noriega","José Martínez","José Rondón","Ali Castillo","A"),
("1053","¿Quién ganó el título de bateo de la LVBP 2024-2025?","Juan Santana","Ali Castillo","Lorenzo Cedrola","Harold Castro","C"),
("1054","¿Quién dirigió al Magallanes campeón de la LVBP 1993-1994?","Phil Regan","Tim Tolman","John Tamargo","Alfredo Pedrique","B"),
("1055","¿Quién dirigió a Águilas en su título caribeño de 1989?","Lipso Nava","Pompeyo Davallilo","Rubén Amaro","Pete Mackanin","D"),
("1056","¿Quién dirigió a Venezuela en el Clásico Mundial de 2023?","Omar López","Luis Sojo","Omar Vizquel","Carlos Subero","A"),
("1057","¿Qué venezolano lanzó un juego perfecto contra Tampa Bay en 2012?","Carlos Zambrano","Johan Santana","Félix Hernández","Aníbal Sánchez","C"),
("1058","¿A qué equipo japonés dirigió Alex Ramirez desde 2016?","Yokohama DeNA BayStars","Leones de Seibu","Gigantes de Yomiuri","Golondrinas de Yakult","A"),
("1059","¿Contra qué equipo lanzó Aníbal Sánchez su no-hitter de 2006?","Diamondbacks de Arizona","Dodgers de Los Ángeles","Mets de Nueva York","Bravos de Atlanta","A"),
("1060","¿Quién fue el Regreso del Año de Bravos en la temporada 2010-2011?","Osmer Morales","Ramón Flores","Yusmeiro Petit","Alberto González","C"),
("1061","¿Qué venezolano fue MVP de la Serie de Campeonato de la Nacional de 1980?","Victor Davallilo","Antonio Armas","Jesús Marcano Trillo","Baudilio Díaz","C"),
("1062","¿Con qué equipo lideró Antonio Armas la Americana en jonrones en 1984?","Angelinos de California","Atléticos de Oakland","Medias Rojas de Boston","Piratas de Pittsburgh","C"),
("1063","¿Qué venezolano ganó el Novato del Año de la Americana en 1985?","Oswaldo Guillén","Omar Vizquel","Andrés Galarraga","Carlos García","A"),
("1064","¿A qué legendario campocorto sustituyó Chico Carrasquel en Chicago en 1950?","Phil Rizzuto","Lou Boudreau","Luke Appling","Pee Wee Reese","C"),
("1065","¿Quién conectó 20 jonrones con Leones en la ronda regular 1979-1980?","Baudilio Díaz","Antonio Armas","Gonzalo Márquez","Victor Davallilo","A"),
("1066","¿Quién dirigió a Venezuela en el primer Clásico Mundial, en 2006?","Oswaldo Guillén","Omar Vizquel","Carlos Subero","Luis Sojo","D"),
("1067","¿Cuántos Guantes de Oro ganó Omar Vizquel en MLB?","10","11","13","9","B"),
("1068","¿Qué venezolano bateó de 6-6 para los Mets el 30 de agosto de 1999?","Roger Cedeño","Melvin Mora","Edgardo Alfonzo","Luis Sojo","C"),
("1069","¿Qué venezolano ganó el Bate de Plata como antesalista de Baltimore en 2004?","Martin Prado","Melvin Mora","Edgardo Alfonzo","Miguel Cabrera","B"),
("1070","¿Qué lanzador recibió Houston al enviar a Carlos Guillén y Freddy García a Seattle en 1998?","Pedro Martínez","Curt Schilling","Roger Clemens","Randy Johnson","D"),
("1071","¿Qué venezolano ganó el juego que selló la Serie Mundial de 2005 para Chicago?","Kelvim Escobar","Johan Santana","Félix Hernández","Freddy García","D"),
("1072","¿Desde qué club llegó Ildemaro Vargas a Cardenales en el canje de 2015?","Tigres de Aragua","Caribes de Anzoátegui","Navegantes del Magallanes","Bravos de Margarita","B"),
("1073","¿A qué jugador homenajea el número 1 retirado por Cardenales?","Luis Aponte","Luis Leal","Luis Sojo","Luis Valbuena","D"),
("1074","¿A quién pertenece el número 9 retirado por Cardenales?","Carlos Santeliz","Domingo Carrasquel","Alexis Infante","Alfonso Carrasquel","B"),
("1075","¿Qué refuerzo fue MVP de la final 2005-2006 con Leones?","Albert Vargas","Géremi González","Rafael Álvarez","Carlos Guillén","D"),
("1076","¿Quién fue MVP de la final 2009-2010 ganada por Leones?","Gregor Blanco","Carlos Maldonado","Jackson Melián","José Castillo","A"),
("1077","¿Quién dirigió a Leones al título 1994-1995 tras sustituir a Phil Regan?","Carlos Subero","Regino Otero","Felipe Rojas Alou","Pompeyo Davallilo","D"),
("1078","¿Quién blanqueó a Águilas en el séptimo juego de la final 1977-1978?","Pablo Torrealba","Urbano Lugo","Ubaldo Heredia","Diego Seguí","A"),
("1079","¿A quién derrotó Lara en la final 2018-2019?","Caribes de Anzoátegui","Leones del Caracas","Tiburones de La Guaira","Tigres de Aragua","B"),
("1080","¿Quién ganó el título de bateo de la LVBP en 2017-2018?","Jesús Montero","Henry Urrutia","Alberto Callaspo","Rangel Ravelo","B"),
("1081","¿Qué campeón bate de Lara ganó el título de bateo de la LVBP en 2009-2010?","Alexis Infante","Alcides Escobar","Tomás Pérez","César Iturris","B"),
("1082","¿Quién ganó el Novato del Año de la LVBP en 2020-2021?","Jhonny Pereda","José Alejandro Martínez","Diego Rincones","Iván Medina","A"),
("1083","¿Quién fue el Jugador Más Valioso de la LVBP en 2020-2021?","Willians Astudillo","Ramón Flores","Hernán Pérez","Danny Vásquez","C"),
("1084","¿Quién fue MVP de la final 2015-2016 ganada por Tigres?","Alex Romero","Alfredo Marte","Héctor Giménez","Eduardo Escobar","B"),
("1085","¿Quién ganó el Novato del Año de la LVBP en 2015-2016?","Gabriel Lino","Teodoro Martínez","José Peraza","José Osuna","D"),
("1086","¿Quién fue MVP de la final 2016-2017 ganada por Águilas?","José Pirela","Freddy Galvis","Ali Castillo","Ronny Cedeño","A"),
("1087","¿Quién fue MVP de la final 2017-2018 ganada por Caribes?","Niuman Romero","Rafael Ortega","Luis Jiménez","Balbino Fuenmayor","C"),
("1088","¿Quién fue el Jugador Más Valioso de la LVBP en 2021-2022?","Balbino Fuenmayor","Danny Vásquez","Ángel Reyes","Nellie Rodríguez","A"),
("1089","¿Qué jugador de Tiburones ganó el MVP de la LVBP en 2014-2015?","Odúbel Herrera","Álex Cabrera","César Suárez","Alexi Amarista","A"),
("1090","¿Quién dirigió a Magallanes cuando conquistó el título 2012-2013?","Gregorio Machado","Carlos Subero","Luis Sojo","Alfredo Pedrique","C"),
]

def lote(code: str) -> str:
    n = int(code)
    if n <= 30:
        return "Lote 01"
    if n <= 1060:
        return "Lote 02"
    return "Lote 03"

def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"

assert len(ROWS) == 90, len(ROWS)
assert len({row[0] for row in ROWS}) == 90

lines = []
lines.append("-- Banco oficial Intermedio (90). Dificultad medium = Intermedio en la app (4 pts).")
lines.append("-- No hay columna de tiempo: la app ya usa 15 segundos para todas las trivias.")
lines.append("-- El archivo fuente no trae tema; se guarda el lote en category.")
lines.append("insert into public.pulse_trivia_questions")
lines.append("  (id, code, prompt, options, correct_option, explanation, category, difficulty, status, publish_date, points, created_by, review_note)")
lines.append("values")
values = []
for code, prompt, a, b, c, d, letter in ROWS:
    options = json.dumps([
        {"id": "a", "label": a},
        {"id": "b", "label": b},
        {"id": "c", "label": c},
        {"id": "d", "label": d},
    ], ensure_ascii=False)
    qid = "trv_int_" + code
    values.append(
        "  ("
        + ", ".join([
            sql_str(qid),
            sql_str(code),
            sql_str(prompt),
            sql_str(options) + "::jsonb",
            sql_str(letter.lower()),
            "null",
            sql_str(lote(code)),
            "'medium'",
            "'active'",
            "null",
            "4",
            "null",
            "null",
        ])
        + ")"
    )
lines.append(",\n".join(values))
lines.append("on conflict (code) where code is not null do nothing;")
lines.append("")
lines.append("update public.pulse_trivia_questions")
lines.append("set status = 'disabled',")
lines.append("    review_note = 'fuera del banco Intermedio oficial'")
lines.append("where difficulty = 'medium'")
lines.append("  and status = 'active'")
lines.append("  and id not like 'trv_int_%';")
lines.append("")

out = Path("supabase/migrations/20261013040000_trivia_intermedio_bank.sql")
out.write_text("\n".join(lines), encoding="utf-8")
print(f"wrote {out} rows={len(ROWS)} bytes={out.stat().st_size}")
