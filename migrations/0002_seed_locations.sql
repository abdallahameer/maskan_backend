INSERT INTO cities (name) VALUES ('الخرطوم');
INSERT INTO cities (name) VALUES ('الخرطوم بحري');
INSERT INTO cities (name) VALUES ('أم درمان');

INSERT INTO areas (city_id, name) VALUES
  ((SELECT id FROM cities WHERE name = 'الخرطوم'), 'الرياض'),
  ((SELECT id FROM cities WHERE name = 'الخرطوم'), 'المنشية'),
  ((SELECT id FROM cities WHERE name = 'الخرطوم'), 'العمارات'),
  ((SELECT id FROM cities WHERE name = 'الخرطوم'), 'الطائف'),
  ((SELECT id FROM cities WHERE name = 'الخرطوم'), 'المقرن'),
  ((SELECT id FROM cities WHERE name = 'الخرطوم'), 'أركويت'),

  ((SELECT id FROM cities WHERE name = 'الخرطوم بحري'), 'كافوري'),
  ((SELECT id FROM cities WHERE name = 'الخرطوم بحري'), 'شمبات'),
  ((SELECT id FROM cities WHERE name = 'الخرطوم بحري'), 'الدباسين'),

  ((SELECT id FROM cities WHERE name = 'أم درمان'), 'الموردة'),
  ((SELECT id FROM cities WHERE name = 'أم درمان'), 'ابروف'),
  ((SELECT id FROM cities WHERE name = 'أم درمان'), 'الثورة');