import { Component, computed, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../../../core/services/product.service';
import { CartService } from '../../../../core/services/cart.service';
import { FavoritesService } from '../../../../core/services/favorites.service';
import { CategoryService } from '../../../../core/services/category.service';
import { AdSlot } from '../../../../core/components/ad-slot/ad-slot';

@Component({
  selector: 'app-home',
  imports: [RouterLink, AdSlot],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  readonly productService = inject(ProductService);
  readonly cart = inject(CartService);
  readonly fav = inject(FavoritesService);
  private categoryService = inject(CategoryService);

  readonly categories = computed(() => {
    const all = this.productService.list();
    return this.categoryService.list().slice(0, 6).map(c => ({
      ...c,
      count: all.filter(p => p.category === c.name).length,
    }));
  });

  readonly bestProducts = computed(() =>
    [...this.productService.list()]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 8)
  );

  currentSlide = signal(0);
  readonly slideCount = computed(() => Math.ceil(this.bestProducts().length / 4));

  prev(): void {
    this.currentSlide.update(v => (v > 0 ? v - 1 : this.slideCount() - 1));
  }

  next(): void {
    this.currentSlide.update(v => (v < this.slideCount() - 1 ? v + 1 : 0));
  }

  goTo(i: number): void { this.currentSlide.set(i); }

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
}
