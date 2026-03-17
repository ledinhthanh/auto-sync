-- Clean up
DROP TABLE IF EXISTS mysql_faculty;

-- 1. Simple Table: mysql_faculty
CREATE TABLE mysql_faculty (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  salary DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO mysql_faculty (name, department, salary) VALUES
  ('MySQL User 1', 'Engineering', 90000),
  ('MySQL User 2', 'Design', 75000),
  ('MySQL User 3', 'Product', 85000);
