import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../../core/services/product.service';
import { CartService } from '../../../../core/services/cart.service';
import { FavoritesService } from '../../../../core/services/favorites.service';
import { CategoryService } from '../../../../core/services/category.service';
import { AdSlot } from '../../../../core/components/ad-slot/ad-slot';

interface PriceRange { min: number; max: number; label: string; }

@Component({
  selector: 'app-category',
  imports: [RouterLink, FormsModule, AdSlot],
  templateUrl: './category.html',
  styleUrl: './category.css',
})
export class Category {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  readonly cart = inject(CartService);
  readonly fav = inject(FavoritesService);

  readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map(p => Number(p.get('id')))),
    { initialValue: 0 }
  );

  readonly currentCat = computed(() => this.categoryService.getById(this.id()));

  readonly cats = computed(() => [...this.categoryService.list()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));

  readonly selectedCats = signal<Set<number>>(new Set());
  readonly selectedCatsLabel = computed(() => {
    const cats = this.cats();
    const sel = this.selectedCats();
    if (sel.size === 0) return this.currentCat()?.name ?? 'Categoria';
    return Array.from(sel).map(id => cats.find(c => c.id === id)?.name).filter((n): n is string => !!n).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(' - ');
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) this.selectedCats.set(new Set([id]));
    });
  }

  readonly products = computed(() => {
    const cats = this.cats();
    const sel = this.selectedCats();
    if (sel.size === 0) return this.productService.list();
    return this.productService.list().filter(p => {
      const ci = cats.find(c => c.name === p.category);
      return ci ? sel.has(ci.id) : false;
    });
  });

  readonly priceRanges: PriceRange[] = [
    { label: 'Até R$ 500', min: 0, max: 500 },
    { label: 'R$ 500 - R$ 1.000', min: 500, max: 1000 },
    { label: 'R$ 1.000 - R$ 3.000', min: 1000, max: 3000 },
    { label: 'Acima de R$ 3.000', min: 3000, max: Infinity },
  ];
  selectedPrice = signal<PriceRange | null>(null);

  readonly filtered = computed(() => {
    let list = this.products();
    const pr = this.selectedPrice();
    if (pr) list = list.filter(p => p.price >= pr.min && p.price < pr.max);
    return list;
  });

  readonly sortOpts = ['Mais Relevantes', 'Menor Preço', 'Maior Preço', 'Melhor Avaliação'];
  readonly sort = signal(this.sortOpts[0]);
  readonly page = signal(1);
  readonly pageSize = 12;

  readonly sorted = computed(() => {
    const list = [...this.filtered()];
    switch (this.sort()) {
      case 'Menor Preço': return list.sort((a, b) => a.price - b.price);
      case 'Maior Preço': return list.sort((a, b) => b.price - a.price);
      case 'Melhor Avaliação': return list.sort((a, b) => b.rating - a.rating);
      default: return list;
    }
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.sorted().length / this.pageSize)));

  readonly paged = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.sorted().slice(start, start + this.pageSize);
  });

  toggleCat(id: number): void {
    this.selectedCats.update(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    this.page.set(1);
  }

  pickPrice(r: PriceRange | null): void {
    this.selectedPrice.set(r);
    this.page.set(1);
  }

  getStars(rating: number): string[] {
    const f = Math.floor(rating);
    const s: string[] = [];
    for (let i = 0; i < f; i++) s.push('full');
    while (s.length < 5) s.push('empty');
    return s;
  }

  fmt(v: number): string {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  countFor(catName: string): number {
    const list = this.productService.list();
    const pr = this.selectedPrice();
    const base = pr ? list.filter(p => p.price >= pr.min && p.price < pr.max) : list;
    return base.filter(p => p.category === catName).length;
  }
}
