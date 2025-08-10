# Code Architecture Guidelines

## 📏 Hard Requirements (Must-Follow)

### ✅ File Line Limits
- **Dynamic Languages** (Python, JavaScript, TypeScript):
  - Each code file **must not exceed 200 lines**
- **Static Languages** (Java, Go, Rust):
  - Each code file **must not exceed 250 lines**

> 📌 *Purpose: Improve readability, maintainability, and reduce cognitive load*

### ✅ Folder Structure Limits
- Each folder should contain **no more than 8 files**
- If exceeded, perform **multi-level subfolder splitting**

> 📌 *Purpose: Enhance structural clarity for quick location and extension*

---

## 🧠 Architecture Design Concerns (Continuous Vigilance)

The following "code smells" severely erode code quality and **must be constantly monitored and avoided**:

### ❌ 1. Rigidity
> System is difficult to change; minor modifications trigger chain reactions
- **Problem**: High change cost, low development efficiency
- **Solution**: Introduce interface abstraction, strategy pattern, dependency inversion principle

### ❌ 2. Redundancy
> Same logic appears repeatedly, difficult to maintain
- **Problem**: Code bloat, poor consistency
- **Solution**: Extract common functions/classes, use composition over inheritance

### ❌ 3. Circular Dependency
> Modules depend on each other, forming "deadlocks"
- **Problem**: Difficult to test, reuse, and maintain
- **Solution**: Use interface decoupling, event mechanisms, dependency injection

### ❌ 4. Fragility
> Modifying one part causes seemingly unrelated parts to fail
- **Problem**: System instability, frequent regression issues
- **Solution**: Follow single responsibility principle, improve module cohesion

### ❌ 5. Obscurity
> Chaotic code structure, unclear intent
- **Problem**: Difficult onboarding, collaboration challenges
- **Solution**: Clear naming, proper comments, concise structure, comprehensive documentation

### ❌ 6. Data Clumps
> Multiple parameters always appear together, suggesting object encapsulation
- **Problem**: Bloated function parameters, unclear semantics
- **Solution**: Encapsulate into data structures or value objects

### ❌ 7. Needless Complexity
> Over-engineering, using complex solutions for simple problems
- **Problem**: High understanding cost, difficult maintenance
- **Solution**: Follow YAGNI principle, KISS principle, design as needed

---

## 🚨 Important Reminders

> **[CRITICAL]** Whether writing, reading, or reviewing code, you must strictly adhere to the above hard requirements and continuously monitor architecture design quality.

> **[CRITICAL]** Upon detecting any "code smells", immediately alert the user about potential optimizations and provide reasonable improvement suggestions.